import { beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockGetSessionPresence: vi.fn(),
}))

vi.mock('@/services/session.service', () => ({
  getSession: mocks.mockGetSession,
  getSessionUsers: mocks.mockGetSessionUsers,
}))

vi.mock('@/services/room.service', () => ({
  getSessionPresence: mocks.mockGetSessionPresence,
}))

import { resolveCooldownControlAuthorization } from '@/services/session-cooldown-authz.service'

describe('session-cooldown-authz.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: 'ENDED',
    })

    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: PLAYER_ID, username: 'player', role: 'PLAYER' },
    ])

    mocks.mockGetSessionPresence.mockResolvedValue([
      { userId: DM_ID, state: 'OFFLINE' },
      { userId: PLAYER_ID, state: 'ONLINE' },
    ])
  })

  it('authorizes DM directly during ended cooldown', async () => {
    const result = await resolveCooldownControlAuthorization({
      sessionId: SESSION_ID as any,
      requesterUserId: DM_ID as any,
    })

    expect(result).toEqual({ ok: true, transitionActorUserId: DM_ID })
  })

  it('authorizes connected player when DM is disconnected', async () => {
    const result = await resolveCooldownControlAuthorization({
      sessionId: SESSION_ID as any,
      requesterUserId: PLAYER_ID as any,
    })

    expect(result).toEqual({ ok: true, transitionActorUserId: DM_ID })
  })

  it('rejects player when DM is still connected', async () => {
    mocks.mockGetSessionPresence.mockResolvedValue([
      { userId: DM_ID, state: 'ONLINE' },
      { userId: PLAYER_ID, state: 'ONLINE' },
    ])

    const result = await resolveCooldownControlAuthorization({
      sessionId: SESSION_ID as any,
      requesterUserId: PLAYER_ID as any,
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('DM is disconnected')
  })

  it('rejects requester when not a connected player', async () => {
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: PLAYER_ID, username: 'player', role: 'PLAYER' },
    ])

    const result = await resolveCooldownControlAuthorization({
      sessionId: SESSION_ID as any,
      requesterUserId: '44444444-4444-4444-8444-444444444444' as any,
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Only DM or connected players')
  })
})
