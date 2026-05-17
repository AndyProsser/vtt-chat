import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockCreateSession: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockUpdateSessionState: vi.fn(),
  mockAddUserToSession: vi.fn(),
  mockRemoveUserFromSession: vi.fn(),
  mockGetAllSessions: vi.fn(),
  mockUpdateSessionMetadata: vi.fn(),
  mockDeleteSession: vi.fn(),
  mockEnsureSessionDefaultRoomsForSession: vi.fn(),
  mockEnsureSessionWhisperRoomForSession: vi.fn(),
  mockGetRooms: vi.fn(),
  mockGetSessionPresence: vi.fn(),
  mockJoinRoom: vi.fn(),
  mockResolveRoleForSessionJoin: vi.fn(),
  mockAppendSessionAuditEvent: vi.fn(),
  mockLogSessionJoin: vi.fn(),
  mockLogSessionLeave: vi.fn(),
  mockLogSessionCooldownExtended: vi.fn(),
  mockLogSessionStateChange: vi.fn(),
  mockCountSessionCooldownExtensions: vi.fn(),
  mockListSessionLogsForRequester: vi.fn(),
  mockListSessionUsersForRequester: vi.fn(),
  mockBroadcastSessionStatsSnapshot: vi.fn(),
  mockGetPrismaClient: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: mocks.mockGetPrismaClient,
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session/core.service', () => ({
  createSession: mocks.mockCreateSession,
  endSessionCooldown: vi.fn(),
  extendSessionCooldown: vi.fn(),
  getSession: mocks.mockGetSession,
  getAllSessions: mocks.mockGetAllSessions,
  updateSessionMetadata: mocks.mockUpdateSessionMetadata,
  updateSessionState: mocks.mockUpdateSessionState,
  deleteSession: mocks.mockDeleteSession,
  addUserToSession: mocks.mockAddUserToSession,
  removeUserFromSession: mocks.mockRemoveUserFromSession,
  getSessionUsers: mocks.mockGetSessionUsers,
}))

vi.mock('@/services/room.service', () => ({
  applySessionStateRoomTransition: vi.fn(),
  deletePrivateRoomsForEndedSession: vi.fn(),
  ensureSessionDefaultRoomsForSession: mocks.mockEnsureSessionDefaultRoomsForSession,
  ensureSessionWhisperRoomForSession: mocks.mockEnsureSessionWhisperRoomForSession,
  getRooms: mocks.mockGetRooms,
  getSessionPresence: mocks.mockGetSessionPresence,
  joinRoom: mocks.mockJoinRoom,
}))

vi.mock('@/services/audio/audio-state', () => ({
  clearRoomEnvironmentState: vi.fn(),
  clearSessionDMOverrideState: vi.fn(),
  getSessionAudioState: vi
    .fn()
    .mockResolvedValue({ dmOverrides: [], broadcast: { enabled: false } }),
}))

vi.mock('@/services/chat.service', () => ({
  clearRoomMessages: vi.fn(),
}))

vi.mock('@/services/system-messages.service', () => ({
  emitSessionBoundarySystemMessage: vi.fn(),
  emitSessionRecapMessage: vi.fn(),
  emitSessionSummaryMessage: vi.fn(),
}))

vi.mock('@/services/session/logs.service', () => ({
  countSessionCooldownExtensions: mocks.mockCountSessionCooldownExtensions,
  logSessionCooldownExtended: mocks.mockLogSessionCooldownExtended,
  logSessionJoin: mocks.mockLogSessionJoin,
  logSessionLeave: mocks.mockLogSessionLeave,
  logSessionStateChange: mocks.mockLogSessionStateChange,
}))

vi.mock('@/services/session/access.service', () => ({
  listSessionLogsForRequester: mocks.mockListSessionLogsForRequester,
  listSessionUsersForRequester: mocks.mockListSessionUsersForRequester,
}))

vi.mock('@/services/session/authz.service', () => ({
  resolveRoleForSessionJoin: mocks.mockResolveRoleForSessionJoin,
}))

vi.mock('@/services/session/stats.service', () => ({
  broadcastSessionStatsSnapshot: mocks.mockBroadcastSessionStatsSnapshot,
}))

vi.mock('@/services/session/cooldown-authz.service', () => ({
  resolveCooldownControlAuthorization: vi.fn(),
}))

vi.mock('@/services/runtime/runtime-streams.service', () => ({
  appendSessionAuditEvent: mocks.mockAppendSessionAuditEvent,
}))

import sessionRoutes from '@/api/session.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'
const MAIN_ROOM_ID = '44444444-4444-4444-8444-444444444444'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/session', sessionRoutes)
  return app
}

describe('session routes audit appends', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockGetPrismaClient.mockReturnValue({
      session: {
        findUnique: vi.fn().mockResolvedValue({ campaign: { postSessionChatDurationMs: 60000 } }),
      },
    })

    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({ userId: DM_ID, username: 'gm', role: 'DM' })

    mocks.mockCreateSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'IDLE',
      createdAt: Date.now(),
    })

    mocks.mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'ACTIVE',
      createdAt: Date.now(),
    })

    mocks.mockGetSessionUsers.mockResolvedValue([{ id: DM_ID, username: 'gm', role: 'DM' }])
    mocks.mockUpdateSessionState.mockResolvedValue(null)
    mocks.mockAddUserToSession.mockResolvedValue(true)
    mocks.mockRemoveUserFromSession.mockResolvedValue({
      removed: true,
      promotedSpectator: { promoted: false },
    })

    mocks.mockEnsureSessionDefaultRoomsForSession.mockResolvedValue(undefined)
    mocks.mockEnsureSessionWhisperRoomForSession.mockResolvedValue(undefined)
    mocks.mockGetRooms.mockResolvedValue([
      {
        id: MAIN_ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Main Room',
        type: 'MAIN',
      },
    ])
    mocks.mockGetSessionPresence.mockResolvedValue([])
    mocks.mockJoinRoom.mockResolvedValue({
      sessionId: SESSION_ID,
      userId: PLAYER_ID,
      username: 'alice',
      state: 'ONLINE',
      primaryRoomId: MAIN_ROOM_ID,
      previousGroupId: null,
    })

    mocks.mockResolveRoleForSessionJoin.mockResolvedValue({ ok: true, role: 'PLAYER' })
    mocks.mockAppendSessionAuditEvent.mockResolvedValue(undefined)
    mocks.mockLogSessionJoin.mockResolvedValue(undefined)
    mocks.mockLogSessionLeave.mockResolvedValue(undefined)
    mocks.mockLogSessionCooldownExtended.mockResolvedValue(undefined)
    mocks.mockLogSessionStateChange.mockResolvedValue(undefined)
    mocks.mockCountSessionCooldownExtensions.mockResolvedValue(0)
    mocks.mockListSessionLogsForRequester.mockResolvedValue({ ok: true, logs: [] })
    mocks.mockListSessionUsersForRequester.mockResolvedValue({ ok: true, users: [] })
    mocks.mockBroadcastSessionStatsSnapshot.mockResolvedValue(undefined)
  })

  it('appends SESSION_CREATED audit event', async () => {
    const app = buildApp()

    const res = await request(app)
      .post('/api/session')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Session 1', description: 'desc' })

    expect(res.status).toBe(201)
    expect(mocks.mockAppendSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        actionType: 'SESSION_CREATED',
        targetType: 'SESSION',
        targetId: SESSION_ID,
      })
    )
  })

  it('appends SESSION_MEMBER_JOINED audit event', async () => {
    mocks.mockVerifyToken.mockReturnValue({ userId: PLAYER_ID, username: 'alice', role: 'PLAYER' })

    const app = buildApp()

    const res = await request(app)
      .post(`/api/session/${SESSION_ID}/join`)
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(mocks.mockAppendSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        actionType: 'SESSION_MEMBER_JOINED',
        targetType: 'SESSION_MEMBERSHIP',
        targetId: PLAYER_ID,
      })
    )
  })

  it('appends SESSION_MEMBER_LEFT audit event', async () => {
    mocks.mockVerifyToken.mockReturnValue({ userId: PLAYER_ID, username: 'alice', role: 'PLAYER' })
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: DM_ID, username: 'gm', role: 'DM' },
      { id: PLAYER_ID, username: 'alice', role: 'PLAYER' },
    ])

    const app = buildApp()

    const res = await request(app)
      .post(`/api/session/${SESSION_ID}/leave`)
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(mocks.mockAppendSessionAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        actionType: 'SESSION_MEMBER_LEFT',
        targetType: 'SESSION_MEMBERSHIP',
        targetId: PLAYER_ID,
      })
    )
  })
})
