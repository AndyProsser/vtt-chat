import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorCode, SessionState, type UUID } from '@shared'

const mocks = vi.hoisted(() => {
  const sessions = new Map<string, any>()
  const members = new Map<string, Array<any>>()

  return {
    sessions,
    members,
    findSessionById: vi.fn(async (sessionId: string) => {
      const row = sessions.get(sessionId)
      return row ? { ...row } : null
    }),
    updateSessionMetadataRecord: vi.fn(async ({ sessionId, ...updates }: any) => {
      const current = sessions.get(sessionId)
      if (!current) return
      sessions.set(sessionId, {
        ...current,
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.plannedDurationMinutes !== undefined
          ? { plannedDurationMinutes: updates.plannedDurationMinutes }
          : {}),
      })
    }),
    updateSessionStateRecord: vi.fn(async ({ sessionId, newState, ...updates }: any) => {
      const current = sessions.get(sessionId)
      if (!current) return
      sessions.set(sessionId, {
        ...current,
        state: newState,
        ...(updates.startedAt !== undefined ? { startedAt: updates.startedAt } : {}),
        ...(updates.endedAt !== undefined ? { endedAt: updates.endedAt } : {}),
        ...(updates.cumulativePauseMs !== undefined
          ? { cumulativePauseMs: updates.cumulativePauseMs }
          : {}),
        ...(updates.pauseCount !== undefined ? { pauseCount: updates.pauseCount } : {}),
        ...(updates.pauseStartedAt !== undefined ? { pauseStartedAt: updates.pauseStartedAt } : {}),
      })
    }),
    updateSessionEndedAtRecord: vi.fn(async ({ sessionId, endedAt }: any) => {
      const current = sessions.get(sessionId)
      if (!current) return
      sessions.set(sessionId, { ...current, endedAt })
    }),
    listSessionMembers: vi.fn(async (sessionId: string) => members.get(sessionId) || []),
    removeSessionMember: vi.fn(async ({ sessionId, userId }: any) => {
      const rows = members.get(sessionId) || []
      const next = rows.filter((row) => row.userId !== userId)
      members.set(sessionId, next)
      return next.length !== rows.length
    }),
    listSessions: vi.fn(async () => []),
    createSessionRecord: vi.fn(async () => undefined),
    deleteSessionRecord: vi.fn(async () => undefined),
    upsertSessionMember: vi.fn(async () => undefined),
    promoteNextWaitlistedSpectatorForSession: vi.fn(async () => ({
      promoted: true,
      userId: 'w-1',
    })),
    getSessionEventHistory: vi.fn(async () => [{ id: 'e-1', type: 'SYSTEM' }]),
  }
})

vi.mock('@/repositories/session.repository', () => ({
  createSessionRecord: mocks.createSessionRecord,
  deleteSessionRecord: mocks.deleteSessionRecord,
  findSessionById: mocks.findSessionById,
  listSessionMembers: mocks.listSessionMembers,
  listSessions: mocks.listSessions,
  removeSessionMember: mocks.removeSessionMember,
  updateSessionEndedAtRecord: mocks.updateSessionEndedAtRecord,
  updateSessionMetadataRecord: mocks.updateSessionMetadataRecord,
  updateSessionStateRecord: mocks.updateSessionStateRecord,
  upsertSessionMember: mocks.upsertSessionMember,
}))

vi.mock('@/services/guest-auth', () => ({
  promoteNextWaitlistedSpectatorForSession: mocks.promoteNextWaitlistedSpectatorForSession,
}))

vi.mock('@/services/session/logs.service', () => ({
  getSessionEventHistory: mocks.getSessionEventHistory,
}))

import {
  endSessionCooldown,
  extendSessionCooldown,
  listSessionLogsForRequester,
  listSessionUsersForRequester,
  removeUserFromSession,
  updateSessionMetadata,
  updateSessionState,
} from '@/services/session/core.service'

const asUuid = (value: string) => value as UUID
const SESSION_ID = asUuid('11111111-1111-4111-8111-111111111111')
const DM_ID = asUuid('22222222-2222-4222-8222-222222222222')
const PLAYER_ID = asUuid('33333333-3333-4333-8333-333333333333')

describe('session core service coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sessions.clear()
    mocks.members.clear()

    mocks.sessions.set(SESSION_ID, {
      id: SESSION_ID,
      campaignId: null,
      name: 'Session Core',
      description: null,
      plannedDurationMinutes: null,
      cumulativePauseMs: 0,
      pauseCount: 0,
      pauseStartedAt: null,
      dmId: DM_ID,
      state: SessionState.IDLE,
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      startedAt: null,
      endedAt: null,
    })

    mocks.members.set(SESSION_ID, [
      { userId: DM_ID, username: 'dm', role: 'DM', joinedAt: new Date('2026-05-01T00:00:00.000Z') },
      {
        userId: PLAYER_ID,
        username: 'player',
        role: 'PLAYER',
        joinedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ])
  })

  it('returns null when metadata update targets missing session', async () => {
    const result = await updateSessionMetadata(
      asUuid('99999999-9999-4999-8999-999999999999'),
      {},
      DM_ID
    )
    expect(result).toBeNull()
  })

  it('rejects metadata updates from non-DM users', async () => {
    await expect(updateSessionMetadata(SESSION_ID, { name: 'X' }, PLAYER_ID)).rejects.toMatchObject(
      {
        code: ErrorCode.FORBIDDEN,
      }
    )
  })

  it('rejects invalid state transitions and archived restarts', async () => {
    await expect(updateSessionState(SESSION_ID, SessionState.ENDED, DM_ID)).rejects.toMatchObject({
      code: ErrorCode.INVALID_STATE_TRANSITION,
    })

    mocks.sessions.set(SESSION_ID, {
      ...mocks.sessions.get(SESSION_ID),
      state: SessionState.IDLE,
      startedAt: new Date('2026-05-01T01:00:00.000Z'),
      endedAt: new Date('2026-05-01T02:00:00.000Z'),
    })

    await expect(updateSessionState(SESSION_ID, SessionState.ACTIVE, DM_ID)).rejects.toMatchObject({
      code: ErrorCode.SESSION_ALREADY_ENDED,
    })
  })

  it('validates cooldown extension and cooldown ending guards', async () => {
    await expect(extendSessionCooldown(SESSION_ID, 60_000, DM_ID)).rejects.toMatchObject({
      code: ErrorCode.INVALID_STATE_TRANSITION,
    })

    mocks.sessions.set(SESSION_ID, {
      ...mocks.sessions.get(SESSION_ID),
      state: SessionState.COOLDOWN,
      endedAt: new Date('2026-05-01T03:00:00.000Z'),
    })

    await expect(extendSessionCooldown(SESSION_ID, 0, DM_ID)).rejects.toMatchObject({
      code: ErrorCode.INVALID_INPUT,
    })

    const extended = await extendSessionCooldown(SESSION_ID, 30_000, DM_ID)
    expect(extended?.state).toBe(SessionState.COOLDOWN)
    expect(mocks.updateSessionEndedAtRecord).toHaveBeenCalledTimes(1)

    mocks.sessions.set(SESSION_ID, {
      ...mocks.sessions.get(SESSION_ID),
      state: SessionState.ACTIVE,
    })
    await expect(endSessionCooldown(SESSION_ID, DM_ID)).rejects.toMatchObject({
      code: ErrorCode.INVALID_STATE_TRANSITION,
    })
  })

  it('promotes next waitlisted spectator when a spectator member is removed', async () => {
    mocks.members.set(SESSION_ID, [
      { userId: DM_ID, username: 'dm', role: 'DM', joinedAt: new Date() },
      { userId: PLAYER_ID, username: 'spectator', role: 'SPECTATOR', joinedAt: new Date() },
    ])

    const result = await removeUserFromSession(SESSION_ID, PLAYER_ID)

    expect(result.removed).toBe(true)
    expect(mocks.promoteNextWaitlistedSpectatorForSession).toHaveBeenCalledWith(SESSION_ID)
    expect(result.promotedSpectator.promoted).toBe(true)
  })

  it('enforces requester authorization for session users and logs', async () => {
    const forbiddenUsers = await listSessionUsersForRequester({
      sessionId: SESSION_ID,
      requester: { userId: 'not-member', role: 'PLAYER' },
    })
    expect(forbiddenUsers).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Not a session member',
    })

    const okLogs = await listSessionLogsForRequester({
      sessionId: SESSION_ID,
      requester: { userId: DM_ID, role: 'DM' },
      limit: 20,
      offset: 0,
    })

    expect(okLogs.ok).toBe(true)
    expect(mocks.getSessionEventHistory).toHaveBeenCalledWith(SESSION_ID, 20, 0)
  })

  it('covers requester access branches and missing-session guards', async () => {
    const missingSessionId = asUuid('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')

    const missingUsers = await listSessionUsersForRequester({
      sessionId: missingSessionId,
      requester: { userId: DM_ID, role: 'DM' },
    })
    expect(missingUsers).toEqual({
      ok: false,
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    })

    const missingLogs = await listSessionLogsForRequester({
      sessionId: missingSessionId,
      requester: { userId: DM_ID, role: 'DM' },
      limit: 10,
      offset: 0,
    })
    expect(missingLogs).toEqual({
      ok: false,
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    })

    const byRole = await listSessionUsersForRequester({
      sessionId: SESSION_ID,
      requester: { userId: 'non-member', role: 'DM' },
    })
    expect(byRole.ok).toBe(true)

    const byDmId = await listSessionUsersForRequester({
      sessionId: SESSION_ID,
      requester: { userId: DM_ID, role: 'PLAYER' },
    })
    expect(byDmId.ok).toBe(true)

    const byMembership = await listSessionUsersForRequester({
      sessionId: SESSION_ID,
      requester: { userId: PLAYER_ID, role: 'PLAYER' },
    })
    expect(byMembership.ok).toBe(true)

    const forbiddenLogs = await listSessionLogsForRequester({
      sessionId: SESSION_ID,
      requester: { userId: 'outsider', role: 'PLAYER' },
      limit: 10,
      offset: 0,
    })
    expect(forbiddenLogs).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Not authorized to view session logs',
    })
  })
})
