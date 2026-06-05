import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetSession: vi.fn(),
  mockExtendSessionCooldown: vi.fn(),
  mockEndSessionCooldown: vi.fn(),
  mockResolveCooldownControlAuthorization: vi.fn(),
  mockCountSessionCooldownExtensions: vi.fn(),
  mockLogSessionCooldownExtended: vi.fn(),
  mockGetPrismaClient: vi.fn(),
  mockApplySessionStateRoomTransition: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockLogSessionStateChange: vi.fn(),
  mockClearRoomMessages: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: mocks.mockGetPrismaClient,
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session/core.service', () => ({
  createSession: vi.fn(),
  getSession: mocks.mockGetSession,
  getAllSessions: vi.fn(async () => []),
  updateSessionState: vi.fn(),
  deleteSession: vi.fn(),
  addUserToSession: vi.fn(),
  removeUserFromSession: vi.fn(),
  getSessionUsers: mocks.mockGetSessionUsers,
  extendSessionCooldown: mocks.mockExtendSessionCooldown,
  endSessionCooldown: mocks.mockEndSessionCooldown,
  updateSessionMetadata: vi.fn(),
}))

vi.mock('@/services/session/cooldown-authz.service', () => ({
  resolveCooldownControlAuthorization: mocks.mockResolveCooldownControlAuthorization,
}))

vi.mock('@/services/session/logs.service', () => ({
  logSessionStateChange: mocks.mockLogSessionStateChange,
  logSessionJoin: vi.fn(),
  logSessionLeave: vi.fn(),
  getSessionEventHistory: vi.fn(),
  countSessionCooldownExtensions: mocks.mockCountSessionCooldownExtensions,
  logSessionCooldownExtended: mocks.mockLogSessionCooldownExtended,
}))

vi.mock('@/services/session/cleanup-job.service', () => ({
  sessionCleanupJobService: {
    notifyLifecycleTrigger: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}))

vi.mock('@/services/system-messages.service', () => ({
  emitSessionBoundarySystemMessage: vi.fn(),
  emitSessionRecapMessage: vi.fn(),
}))

vi.mock('@/services/room.service', () => ({
  applySessionStateRoomTransition: mocks.mockApplySessionStateRoomTransition,
  deletePrivateRoomsForEndedSession: vi.fn(),
  ensureSessionDefaultRoomsForSession: vi.fn(),
  ensureSessionWhisperRoomForSession: vi.fn(),
  getRooms: vi.fn(async () => []),
  getSessionPresence: vi.fn(async () => []),
  joinRoom: vi.fn(),
}))

vi.mock('@/services/audio/audio-state', () => ({
  clearRoomEnvironmentState: vi.fn(),
  clearSessionDMOverrideState: vi.fn(),
  getSessionAudioState: vi.fn(async () => ({ dmOverrides: [], broadcast: { enabled: false } })),
}))

vi.mock('@/services/chat.service', () => ({
  clearRoomMessages: mocks.mockClearRoomMessages,
}))

vi.mock('@/services/runtime/runtime-streams.service', () => ({
  appendSessionAuditEvent: vi.fn(),
  appendChatRuntimeEvent: vi.fn(),
}))

vi.mock('@/services/dev-mock/simulation.service', () => ({
  disableMockSimulationForSessionExit: vi.fn(),
  purgeMockSimulationSessionState: vi.fn(),
}))

vi.mock('@/services/session/access.service', () => ({
  listSessionUsersForRequester: vi.fn(),
  listSessionLogsForRequester: vi.fn(),
}))

vi.mock('@/services/session/authz.service', () => ({
  resolveRoleForSessionJoin: vi.fn(),
}))

vi.mock('@/services/session/stats.service', () => ({
  broadcastSessionStatsSnapshot: vi.fn(),
}))

vi.mock('@/ws/state-recovery', () => ({
  clearSessionRecoveryState: vi.fn(),
}))

import sessionRoutes from '@/api/session.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.locals.wsManager = {
    broadcastEventToSession: vi.fn(),
  }
  app.use('/api/session', sessionRoutes)
  return app
}

describe('cooldown extend handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockGetPrismaClient.mockReturnValue({
      session: {
        findUnique: vi.fn(async () => null),
      },
    })

    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockClearRoomMessages.mockResolvedValue(0)

    mocks.mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 7',
      dmId: DM_ID,
      state: 'COOLDOWN',
      endedAt: Date.now(),
      createdAt: Date.now(),
    })

    mocks.mockExtendSessionCooldown.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 7',
      dmId: DM_ID,
      state: 'COOLDOWN',
      endedAt: Date.now() + 60_000,
      createdAt: Date.now(),
    })

    // During handoff the action runs on behalf of DM identity.
    mocks.mockResolveCooldownControlAuthorization.mockResolvedValue({
      ok: true,
      transitionActorUserId: DM_ID,
    })

    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: DM_ID, username: 'dm-user', role: 'DM', createdAt: Date.now() },
      { id: PLAYER_ID, username: 'player-user', role: 'PLAYER', createdAt: Date.now() },
    ])

    mocks.mockApplySessionStateRoomTransition.mockResolvedValue({
      mainRoomId: '44444444-4444-4444-8444-444444444444',
      mainRoomName: 'Main',
      greenRoomId: '55555555-5555-4555-8555-555555555555',
      greenRoomName: 'Green Room',
      targetRoomId: '55555555-5555-4555-8555-555555555555',
      targetRoomName: 'Green Room',
      movedUsers: 2,
      targetState: 'ONLINE',
      users: [
        { id: DM_ID, username: 'dm-user' },
        { id: PLAYER_ID, username: 'player-user' },
      ],
    })

    mocks.mockEndSessionCooldown.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 7',
      dmId: DM_ID,
      state: 'ENDED',
      endedAt: Date.now(),
      createdAt: Date.now(),
    })
  })

  it('enforces a global max of 3 extends across DM then player handoff', async () => {
    const app = buildApp()

    // DM extends for the 3rd total extension (existing count was 2)
    mocks.mockVerifyToken.mockReturnValueOnce({
      userId: DM_ID,
      username: 'dm-user',
      role: 'DM',
    })
    mocks.mockCountSessionCooldownExtensions.mockResolvedValueOnce(2)

    const dmResponse = await request(app)
      .post(`/api/session/${SESSION_ID}/cooldown/extend`)
      .set('Authorization', 'Bearer token')
      .send({ extensionMs: 60_000 })

    expect(dmResponse.status).toBe(200)
    expect(dmResponse.body.extensionCount).toBe(3)

    // DM disconnects; player now controls cooldown, but cannot exceed total cap of 3
    mocks.mockVerifyToken.mockReturnValueOnce({
      userId: PLAYER_ID,
      username: 'player-user',
      role: 'PLAYER',
    })
    mocks.mockCountSessionCooldownExtensions.mockResolvedValueOnce(3)

    const playerResponse = await request(app)
      .post(`/api/session/${SESSION_ID}/cooldown/extend`)
      .set('Authorization', 'Bearer token')
      .send({ extensionMs: 60_000 })

    expect(playerResponse.status).toBe(409)
    expect(playerResponse.body.message).toContain('up to 3 times per session')
  })

  it('applies and broadcasts room transition when cooldown ends', async () => {
    const app = buildApp()

    mocks.mockVerifyToken.mockReturnValueOnce({
      userId: DM_ID,
      username: 'dm-user',
      role: 'DM',
    })

    const response = await request(app)
      .post(`/api/session/${SESSION_ID}/cooldown/end`)
      .set('Authorization', 'Bearer token')
      .send()

    expect(response.status).toBe(200)
    expect(mocks.mockApplySessionStateRoomTransition).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      dmId: DM_ID,
      nextState: 'ENDED',
      users: [
        { id: DM_ID, username: 'dm-user' },
        { id: PLAYER_ID, username: 'player-user' },
      ],
    })

    const wsCalls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
    const roomTransitionCall = wsCalls.find((call: any[]) => {
      const event = call[1]
      return event?.type === 'ROOM:SESSION_TRANSITION_APPLIED'
    })

    expect(roomTransitionCall).toBeDefined()
    expect(roomTransitionCall[1].payload).toEqual(
      expect.objectContaining({
        nextState: 'ENDED',
        targetRoomId: '55555555-5555-4555-8555-555555555555',
      })
    )
  })
})
