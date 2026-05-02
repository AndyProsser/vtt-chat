import { beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'

const mocks = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockGetSessionEventHistory: vi.fn(),
}))

vi.mock('@/services/session.service', () => ({
  getSession: mocks.mockGetSession,
  getSessionUsers: mocks.mockGetSessionUsers,
}))

vi.mock('@/services/session-logs.service', () => ({
  getSessionEventHistory: mocks.mockGetSessionEventHistory,
}))

import {
  listSessionLogsForRequester,
  listSessionUsersForRequester,
} from '@/services/session-access.service'

describe('session-access.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns session users for a session member', async () => {
    mocks.mockGetSession.mockResolvedValueOnce({ id: SESSION_ID, dmId: DM_ID })
    mocks.mockGetSessionUsers.mockResolvedValueOnce([
      { id: PLAYER_ID, username: 'player-one', role: 'PLAYER' },
    ])

    const result = await listSessionUsersForRequester({
      sessionId: SESSION_ID as any,
      requester: { userId: PLAYER_ID, role: 'PLAYER' },
    })

    expect(result).toEqual({
      ok: true,
      users: [{ id: PLAYER_ID, username: 'player-one', role: 'PLAYER' }],
    })
  })

  it('returns forbidden when requester is not a member', async () => {
    mocks.mockGetSession.mockResolvedValueOnce({ id: SESSION_ID, dmId: DM_ID })
    mocks.mockGetSessionUsers.mockResolvedValueOnce([
      { id: PLAYER_ID, username: 'player-one', role: 'PLAYER' },
    ])

    const result = await listSessionUsersForRequester({
      sessionId: SESSION_ID as any,
      requester: { userId: '44444444-4444-4444-8444-444444444444', role: 'PLAYER' },
    })

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Not a session member' })
  })

  it('returns logs for authorized requesters', async () => {
    mocks.mockGetSession.mockResolvedValueOnce({ id: SESSION_ID, dmId: DM_ID })
    mocks.mockGetSessionUsers.mockResolvedValueOnce([])
    mocks.mockGetSessionEventHistory.mockResolvedValueOnce([{ id: 'log-1' }])

    const result = await listSessionLogsForRequester({
      sessionId: SESSION_ID as any,
      requester: { userId: DM_ID, role: 'DM' },
      limit: 50,
      offset: 0,
    })

    expect(result).toEqual({ ok: true, logs: [{ id: 'log-1' }] })
  })

  it('returns not found when session does not exist', async () => {
    mocks.mockGetSession.mockResolvedValueOnce(null)

    const result = await listSessionLogsForRequester({
      sessionId: SESSION_ID as any,
      requester: { userId: DM_ID, role: 'DM' },
      limit: 50,
      offset: 0,
    })

    expect(result).toEqual({
      ok: false,
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found',
    })
  })
})
