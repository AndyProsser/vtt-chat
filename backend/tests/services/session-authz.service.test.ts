import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Role, type UUID } from '@shared'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionUsers: vi.fn(),
  sessionFindUnique: vi.fn(),
  campaignMembershipFindUnique: vi.fn(),
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: mocks.getSession,
  getSessionUsers: mocks.getSessionUsers,
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    session: { findUnique: mocks.sessionFindUnique },
    campaignMembership: { findUnique: mocks.campaignMembershipFindUnique },
  }),
}))

import {
  deriveCampaignJoinRole,
  normalizePlayerFacingRole,
  resolveEffectiveSessionRole,
  resolveRoleForSessionJoin,
} from '@/services/session/authz.service'

const asUuid = (value: string) => value as UUID
const SESSION_ID = asUuid('11111111-1111-4111-8111-111111111111')
const DM_ID = asUuid('22222222-2222-4222-8222-222222222222')
const USER_ID = asUuid('33333333-3333-4333-8333-333333333333')

describe('session authz service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
    })
    mocks.getSessionUsers.mockResolvedValue([{ id: USER_ID, role: Role.PLAYER }])
    mocks.sessionFindUnique.mockResolvedValue({ campaignId: null })
    mocks.campaignMembershipFindUnique.mockResolvedValue(null)
  })

  it('normalizes player-facing roles and campaign join role defaults', () => {
    expect(normalizePlayerFacingRole(Role.DM)).toBe(Role.DM)
    expect(normalizePlayerFacingRole(Role.PLAYER)).toBe(Role.PLAYER)
    expect(normalizePlayerFacingRole(Role.SPECTATOR)).toBe(Role.SPECTATOR)
    expect(normalizePlayerFacingRole('UNKNOWN')).toBe(Role.PLAYER)

    expect(deriveCampaignJoinRole(Role.SPECTATOR)).toBe(Role.SPECTATOR)
    expect(deriveCampaignJoinRole(Role.DM)).toBe(Role.PLAYER)
  })

  it('returns SESSION_NOT_FOUND when effective role session is missing', async () => {
    mocks.getSession.mockResolvedValueOnce(null)

    const result = await resolveEffectiveSessionRole({ sessionId: SESSION_ID, userId: USER_ID })

    expect(result).toEqual({ ok: false, code: 'SESSION_NOT_FOUND', message: 'Session not found' })
  })

  it('grants DM immediately when membership is not required', async () => {
    const result = await resolveEffectiveSessionRole({ sessionId: SESSION_ID, userId: DM_ID })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.role).toBe(Role.DM)
    }
    expect(mocks.getSessionUsers).not.toHaveBeenCalled()
  })

  it('enforces membership when requireMembershipForDm is true', async () => {
    mocks.getSessionUsers.mockResolvedValueOnce([])

    const missingMembership = await resolveEffectiveSessionRole({
      sessionId: SESSION_ID,
      userId: DM_ID,
      requireMembershipForDm: true,
    })

    expect(missingMembership).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not a member of this session',
    })

    mocks.getSessionUsers.mockResolvedValueOnce([{ id: DM_ID, role: Role.DM }])
    const memberDm = await resolveEffectiveSessionRole({
      sessionId: SESSION_ID,
      userId: DM_ID,
      requireMembershipForDm: true,
    })

    expect(memberDm.ok).toBe(true)
    if (memberDm.ok) {
      expect(memberDm.role).toBe(Role.DM)
    }
  })

  it('rejects non-members and invalid member roles in effective role resolution', async () => {
    mocks.getSessionUsers.mockResolvedValueOnce([])
    let result = await resolveEffectiveSessionRole({ sessionId: SESSION_ID, userId: USER_ID })
    expect(result).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not a member of this session',
    })

    mocks.getSessionUsers.mockResolvedValueOnce([{ id: USER_ID, role: 'GUEST' }])
    result = await resolveEffectiveSessionRole({ sessionId: SESSION_ID, userId: USER_ID })
    expect(result).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not allowed to access this session',
    })
  })

  it('returns member effective role for valid non-DM members', async () => {
    mocks.getSessionUsers.mockResolvedValueOnce([{ id: USER_ID, role: Role.SPECTATOR }])

    const result = await resolveEffectiveSessionRole({ sessionId: SESSION_ID, userId: USER_ID })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.role).toBe(Role.SPECTATOR)
    }
  })

  it('resolves join role with session and campaign guards', async () => {
    mocks.getSession.mockResolvedValueOnce(null)
    let result = await resolveRoleForSessionJoin({ sessionId: SESSION_ID, userId: USER_ID })
    expect(result).toEqual({ ok: false, code: 'SESSION_NOT_FOUND', message: 'Session not found' })

    result = await resolveRoleForSessionJoin({ sessionId: SESSION_ID, userId: DM_ID })
    expect(result).toEqual({ ok: true, role: Role.DM, sessionDmId: DM_ID })

    mocks.sessionFindUnique.mockResolvedValueOnce({ campaignId: null })
    result = await resolveRoleForSessionJoin({ sessionId: SESSION_ID, userId: USER_ID })
    expect(result).toEqual({ ok: true, role: Role.PLAYER, sessionDmId: DM_ID })

    mocks.sessionFindUnique.mockResolvedValueOnce({
      campaignId: asUuid('44444444-4444-4444-8444-444444444444'),
    })
    mocks.campaignMembershipFindUnique.mockResolvedValueOnce(null)
    result = await resolveRoleForSessionJoin({ sessionId: SESSION_ID, userId: USER_ID })
    expect(result).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not a member of this campaign',
    })

    mocks.sessionFindUnique.mockResolvedValueOnce({
      campaignId: asUuid('55555555-5555-4555-8555-555555555555'),
    })
    mocks.campaignMembershipFindUnique.mockResolvedValueOnce({ role: 'UNKNOWN' })
    result = await resolveRoleForSessionJoin({ sessionId: SESSION_ID, userId: USER_ID })
    expect(result).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'You are not a member of this campaign',
    })

    mocks.sessionFindUnique.mockResolvedValueOnce({
      campaignId: asUuid('66666666-6666-4666-8666-666666666666'),
    })
    mocks.campaignMembershipFindUnique.mockResolvedValueOnce({ role: Role.SPECTATOR })
    result = await resolveRoleForSessionJoin({ sessionId: SESSION_ID, userId: USER_ID })
    expect(result).toEqual({ ok: true, role: Role.SPECTATOR, sessionDmId: DM_ID })
  })
})
