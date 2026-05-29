import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockUpdateSessionState: vi.fn(),
  mockRemoveUserFromSession: vi.fn(),
  mockApplySessionStateRoomTransition: vi.fn(),
  mockDeletePrivateRoomsForEndedSession: vi.fn(),
  mockGetSessionAudioState: vi.fn(),
  mockClearSessionDMOverrideState: vi.fn(),
  mockClearRoomEnvironmentState: vi.fn(),
  mockClearRoomMessages: vi.fn(),
  mockEmitSessionBoundarySystemMessage: vi.fn(),
  mockLogSessionStateChange: vi.fn(),
  mockLogSessionLeave: vi.fn(),
  mockBroadcastSessionStatsSnapshot: vi.fn(),
  mockAppendSessionAuditEvent: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: vi.fn(() => ({
    session: {
      findUnique: vi.fn(async () => ({
        campaign: {
          postSessionChatDurationMs: 60_000,
        },
      })),
    },
  })),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session/core.service', () => ({
  createSession: vi.fn(),
  getSession: mocks.mockGetSession,
  getAllSessions: vi.fn(async () => []),
  updateSessionState: mocks.mockUpdateSessionState,
  deleteSession: vi.fn(),
  addUserToSession: vi.fn(),
  removeUserFromSession: mocks.mockRemoveUserFromSession,
  getSessionUsers: mocks.mockGetSessionUsers,
}))

vi.mock('@/services/room.service', () => ({
  applySessionStateRoomTransition: mocks.mockApplySessionStateRoomTransition,
  deletePrivateRoomsForEndedSession: mocks.mockDeletePrivateRoomsForEndedSession,
}))

vi.mock('@/services/audio/audio-state', () => ({
  getSessionAudioState: mocks.mockGetSessionAudioState,
  clearSessionDMOverrideState: mocks.mockClearSessionDMOverrideState,
  clearRoomEnvironmentState: mocks.mockClearRoomEnvironmentState,
}))

vi.mock('@/services/chat.service', () => ({
  clearRoomMessages: mocks.mockClearRoomMessages,
}))

vi.mock('@/services/system-messages.service', () => ({
  emitSessionBoundarySystemMessage: mocks.mockEmitSessionBoundarySystemMessage,
  emitSessionRecapMessage: vi.fn(async () => undefined),
  emitSessionSummaryMessage: vi.fn(async () => undefined),
}))

vi.mock('@/services/session/stats.service', () => ({
  broadcastSessionStatsSnapshot: mocks.mockBroadcastSessionStatsSnapshot,
}))

vi.mock('@/services/runtime/runtime-streams.service', () => ({
  appendSessionAuditEvent: mocks.mockAppendSessionAuditEvent,
}))

vi.mock('@/services/dev-mock/simulation.service', () => ({
  disableMockSimulationForSessionExit: vi.fn(async () => undefined),
}))

vi.mock('@/services/session/logs.service', () => ({
  logSessionStateChange: mocks.mockLogSessionStateChange,
  logSessionJoin: vi.fn(),
  logSessionLeave: mocks.mockLogSessionLeave,
  getSessionEventHistory: vi.fn(),
}))

vi.mock('@/services/session/cleanup-job.service', () => ({
  sessionCleanupJobService: {
    queueCleanup: vi.fn(async () => undefined),
    notifyLifecycleTrigger: vi.fn(async () => undefined),
  },
}))

vi.mock('@/ws/state-recovery', () => ({
  clearSessionRecoveryState: vi.fn(),
}))

vi.mock('@/ws/event-broadcaster', () => ({
  default: {
    isReady: vi.fn(() => false),
    sendToAllAuthenticated: vi.fn(),
    broadcastToCampaignMembers: vi.fn(async () => undefined),
  },
}))

vi.mock('@/services/lobby/lobby-stats.service', () => ({
  broadcastLobbyStatsUpdated: vi.fn(async () => undefined),
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

describe('session state room orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({
      userId: DM_ID,
      username: 'dm-user',
      role: 'DM',
    })

    mocks.mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'IDLE',
      createdAt: Date.now(),
    })

    mocks.mockUpdateSessionState.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'ACTIVE',
      createdAt: Date.now(),
      startedAt: Date.now(),
    })

    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: DM_ID, username: 'dm-user', role: 'DM', createdAt: Date.now() },
      { id: PLAYER_ID, username: 'alice', role: 'PLAYER', createdAt: Date.now() },
    ])

    mocks.mockApplySessionStateRoomTransition.mockResolvedValue({
      mainRoomId: '44444444-4444-4444-8444-444444444444',
      mainRoomName: 'Main Room',
      greenRoomId: '55555555-5555-4555-8555-555555555555',
      greenRoomName: 'Green Room',
      targetRoomId: '44444444-4444-4444-8444-444444444444',
      targetRoomName: 'Main Room',
      movedUsers: 2,
      targetState: 'ONLINE',
      users: [
        { id: DM_ID, username: 'dm-user' },
        { id: PLAYER_ID, username: 'alice' },
      ],
    })

    mocks.mockRemoveUserFromSession.mockResolvedValue({
      removed: true,
      promotedSpectator: { promoted: false },
    })

    mocks.mockGetSessionAudioState.mockResolvedValue({
      dmOverrides: [],
      broadcast: { enabled: false, broadcastRoomId: null },
      rooms: [],
    })
    mocks.mockClearSessionDMOverrideState.mockResolvedValue(undefined)
    mocks.mockClearRoomEnvironmentState.mockResolvedValue(undefined)
    mocks.mockAppendSessionAuditEvent.mockResolvedValue(undefined)

    mocks.mockClearRoomMessages.mockResolvedValue(0)
    mocks.mockDeletePrivateRoomsForEndedSession.mockResolvedValue([])
  })

  it('applies bulk room transitions after session state update', async () => {
    const app = buildApp()

    const response = await request(app)
      .put(`/api/session/${SESSION_ID}/state`)
      .set('Authorization', 'Bearer token')
      .send({ state: 'ACTIVE' })

    expect(response.status).toBe(200)
    expect(mocks.mockApplySessionStateRoomTransition).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      dmId: DM_ID,
      previousState: 'IDLE',
      nextState: 'ACTIVE',
      users: [
        { id: DM_ID, username: 'dm-user' },
        { id: PLAYER_ID, username: 'alice' },
      ],
    })

    const wsCalls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
    expect(wsCalls).toHaveLength(1)
    expect(wsCalls[0][0]).toBe(SESSION_ID)
    expect(wsCalls[0][1].type).toBe('ROOM:SESSION_TRANSITION_APPLIED')
    expect(wsCalls[0][1].payload).toEqual(
      expect.objectContaining({
        nextState: 'ACTIVE',
        movedUsers: 2,
        targetRoomId: '44444444-4444-4444-8444-444444444444',
      })
    )

    expect(mocks.mockEmitSessionBoundarySystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        boundaryType: 'SESSION_STARTED',
        roomIds: ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'],
      })
    )
  })

  it('emits persisted boundary system message on COOLDOWN transition', async () => {
    const app = buildApp()
    const MAIN_ROOM_ID = '44444444-4444-4444-8444-444444444444'
    const GREEN_ROOM_ID = '55555555-5555-4555-8555-555555555555'

    mocks.mockUpdateSessionState.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'COOLDOWN',
      createdAt: Date.now(),
      startedAt: Date.now(),
    })

    mocks.mockApplySessionStateRoomTransition.mockResolvedValueOnce({
      mainRoomId: MAIN_ROOM_ID,
      mainRoomName: 'Main Room',
      greenRoomId: GREEN_ROOM_ID,
      greenRoomName: 'Green Room',
      targetRoomId: GREEN_ROOM_ID,
      targetRoomName: 'Green Room',
      movedUsers: 2,
      targetState: 'ONLINE',
      users: [
        { id: DM_ID, username: 'dm-user' },
        { id: PLAYER_ID, username: 'alice' },
      ],
    })

    const response = await request(app)
      .put(`/api/session/${SESSION_ID}/state`)
      .set('Authorization', 'Bearer token')
      .send({ state: 'COOLDOWN' })

    expect(response.status).toBe(200)
    expect(mocks.mockEmitSessionBoundarySystemMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        boundaryType: 'SESSION_COOLDOWN',
        roomIds: [MAIN_ROOM_ID, GREEN_ROOM_ID],
      })
    )
  })

  it('broadcasts spectator waitlist promotions after a spectator leaves', async () => {
    const app = buildApp()
    mocks.mockVerifyToken.mockReturnValueOnce({
      userId: PLAYER_ID,
      username: 'alice',
      role: 'SPECTATOR',
    })
    mocks.mockGetSessionUsers.mockResolvedValueOnce([
      { id: DM_ID, username: 'dm-user', role: 'DM', createdAt: Date.now() },
      { id: PLAYER_ID, username: 'alice', role: 'SPECTATOR', createdAt: Date.now() },
    ])
    mocks.mockRemoveUserFromSession.mockResolvedValueOnce({
      removed: true,
      promotedSpectator: {
        promoted: true,
        campaignId: 'campaign-1',
        sessionId: SESSION_ID,
        waitlistToken: 'wait-123',
        user: {
          id: '44444444-4444-4444-8444-444444444441',
          username: 'spectator-queue-1',
          displayName: 'Queued Spectator',
          role: 'SPECTATOR',
          authType: 'GUEST',
        },
      },
    })
    mocks.mockGetSessionUsers.mockResolvedValueOnce([
      { id: DM_ID, username: 'dm-user', role: 'DM', createdAt: Date.now() },
      {
        id: '44444444-4444-4444-8444-444444444441',
        username: 'spectator-queue-1',
        role: 'SPECTATOR',
        createdAt: Date.now(),
      },
    ])

    const response = await request(app)
      .post(`/api/session/${SESSION_ID}/leave`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mocks.mockRemoveUserFromSession).toHaveBeenCalledWith(SESSION_ID, PLAYER_ID)
    expect(mocks.mockLogSessionLeave).toHaveBeenCalledWith(SESSION_ID, PLAYER_ID, 'alice')

    const wsCalls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
    expect(wsCalls).toHaveLength(2)
    expect(wsCalls[0][1].payload.content).toBe('alice left the session')
    expect(wsCalls[1][1].payload.content).toBe(
      'spectator-queue-1 was promoted from the spectator waitlist'
    )
  })

  it('does not clear greenroom chat context on pause transition', async () => {
    const app = buildApp()
    const GREEN_ROOM_ID = '55555555-5555-4555-8555-555555555555'
    const MAIN_ROOM_ID = '44444444-4444-4444-8444-444444444444'

    mocks.mockUpdateSessionState.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'PAUSED',
      createdAt: Date.now(),
      startedAt: Date.now(),
    })

    mocks.mockApplySessionStateRoomTransition.mockResolvedValueOnce({
      mainRoomId: MAIN_ROOM_ID,
      mainRoomName: 'Main Room',
      greenRoomId: GREEN_ROOM_ID,
      greenRoomName: 'Green Room',
      targetRoomId: MAIN_ROOM_ID,
      targetRoomName: 'Main Room',
      movedUsers: 2,
      targetState: 'ONLINE',
      users: [
        { id: DM_ID, username: 'dm-user' },
        { id: PLAYER_ID, username: 'alice' },
      ],
    })

    const response = await request(app)
      .put(`/api/session/${SESSION_ID}/state`)
      .set('Authorization', 'Bearer token')
      .send({ state: 'PAUSED' })

    expect(response.status).toBe(200)
    expect(mocks.mockClearRoomMessages).not.toHaveBeenCalled()

    const wsCalls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
    expect(wsCalls).toHaveLength(1)
    expect(wsCalls[0][1].type).toBe('ROOM:SESSION_TRANSITION_APPLIED')
  })

  it('allows the session owner to transition state even if auth role is not DM', async () => {
    const app = buildApp()

    mocks.mockVerifyToken.mockReturnValueOnce({
      userId: DM_ID,
      username: 'dm-user',
      role: 'PLAYER',
    })

    const response = await request(app)
      .put(`/api/session/${SESSION_ID}/state`)
      .set('Authorization', 'Bearer token')
      .send({ state: 'ACTIVE' })

    expect(response.status).toBe(200)
    expect(mocks.mockUpdateSessionState).toHaveBeenCalledWith(SESSION_ID, 'ACTIVE', DM_ID)

    const wsCalls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
    expect(wsCalls).toHaveLength(1)
    expect(wsCalls[0][1]).toEqual(
      expect.objectContaining({
        userId: DM_ID,
        userRole: 'PLAYER',
        type: 'ROOM:SESSION_TRANSITION_APPLIED',
      })
    )
  })

  it('broadcasts per-user room targets supplied by the transition service', async () => {
    const app = buildApp()
    const MAIN_ROOM_ID = '44444444-4444-4444-8444-444444444444'
    const GROUP_ROOM_ID = '66666666-6666-4666-8666-666666666666'

    mocks.mockGetSession.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'PAUSED',
      createdAt: Date.now(),
      startedAt: Date.now(),
    })

    mocks.mockUpdateSessionState.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'ACTIVE',
      createdAt: Date.now(),
      startedAt: Date.now(),
    })

    mocks.mockApplySessionStateRoomTransition.mockResolvedValueOnce({
      mainRoomId: MAIN_ROOM_ID,
      mainRoomName: 'Main Room',
      greenRoomId: '55555555-5555-4555-8555-555555555555',
      greenRoomName: 'Green Room',
      targetRoomId: MAIN_ROOM_ID,
      targetRoomName: 'Main Room',
      movedUsers: 2,
      targetState: 'ONLINE',
      users: [
        { id: DM_ID, username: 'dm-user', roomId: MAIN_ROOM_ID, roomName: 'Main Room' },
        {
          id: PLAYER_ID,
          username: 'alice',
          roomId: GROUP_ROOM_ID,
          roomName: 'Scouts',
          previousGroupId: GROUP_ROOM_ID,
        },
      ],
    })

    const response = await request(app)
      .put(`/api/session/${SESSION_ID}/state`)
      .set('Authorization', 'Bearer token')
      .send({ state: 'ACTIVE' })

    expect(response.status).toBe(200)

    const wsCalls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
    expect(wsCalls[0][1].payload.users).toEqual([
      {
        userId: DM_ID,
        username: 'dm-user',
        roomId: MAIN_ROOM_ID,
        roomName: 'Main Room',
        previousGroupId: null,
      },
      {
        userId: PLAYER_ID,
        username: 'alice',
        roomId: GROUP_ROOM_ID,
        roomName: 'Scouts',
        previousGroupId: GROUP_ROOM_ID,
      },
    ])
  })

  it('resets overrides and clears MAIN environment on ACTIVE transition', async () => {
    const app = buildApp()
    const MAIN_ROOM_ID = '44444444-4444-4444-8444-444444444444'

    mocks.mockGetSessionAudioState.mockResolvedValueOnce({
      dmOverrides: [
        {
          targetUserId: PLAYER_ID,
          overrideType: 'CONDITION',
          isMuted: true,
          condition: 'MUFFLED',
        },
      ],
      broadcast: { enabled: true, broadcastRoomId: MAIN_ROOM_ID },
      rooms: [],
    })

    const response = await request(app)
      .put(`/api/session/${SESSION_ID}/state`)
      .set('Authorization', 'Bearer token')
      .send({ state: 'ACTIVE' })

    expect(response.status).toBe(200)
    expect(mocks.mockClearSessionDMOverrideState).toHaveBeenCalledWith(SESSION_ID)
    expect(mocks.mockClearRoomEnvironmentState).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: MAIN_ROOM_ID,
    })

    const wsCalls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
    expect(wsCalls.map(([, event]: any) => event.type)).toEqual([
      'ROOM:SESSION_TRANSITION_APPLIED',
      'AUDIO:DM_OVERRIDE_REMOVED',
      'AUDIO:BROADCAST_STATE_CHANGED',
    ])
  })

  it('accepts IDLE as the canonical greenroom transition state', async () => {
    const app = buildApp()
    const GREEN_ROOM_ID = '55555555-5555-4555-8555-555555555555'

    mocks.mockUpdateSessionState.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'IDLE',
      createdAt: Date.now(),
    })

    mocks.mockApplySessionStateRoomTransition.mockResolvedValueOnce({
      mainRoomId: '44444444-4444-4444-8444-444444444444',
      mainRoomName: 'Main Room',
      greenRoomId: GREEN_ROOM_ID,
      greenRoomName: 'Green Room',
      targetRoomId: GREEN_ROOM_ID,
      targetRoomName: 'Green Room',
      movedUsers: 2,
      targetState: 'IDLE',
      users: [
        { id: DM_ID, username: 'dm-user' },
        { id: PLAYER_ID, username: 'alice' },
      ],
    })

    const response = await request(app)
      .put(`/api/session/${SESSION_ID}/state`)
      .set('Authorization', 'Bearer token')
      .send({ state: 'IDLE' })

    expect(response.status).toBe(200)
    expect(mocks.mockUpdateSessionState).toHaveBeenCalledWith(SESSION_ID, 'IDLE', DM_ID)
    expect(mocks.mockClearSessionDMOverrideState).toHaveBeenCalledWith(SESSION_ID)
    expect(mocks.mockClearRoomEnvironmentState).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: GREEN_ROOM_ID,
    })
  })

  it('resets overrides and clears Main Room environment on PAUSED transition', async () => {
    const app = buildApp()
    const MAIN_ROOM_ID = '44444444-4444-4444-8444-444444444444'
    const GREEN_ROOM_ID = '55555555-5555-4555-8555-555555555555'

    mocks.mockUpdateSessionState.mockResolvedValueOnce({
      id: SESSION_ID,
      name: 'Session 1',
      dmId: DM_ID,
      state: 'PAUSED',
      createdAt: Date.now(),
      startedAt: Date.now(),
    })

    mocks.mockApplySessionStateRoomTransition.mockResolvedValueOnce({
      mainRoomId: MAIN_ROOM_ID,
      mainRoomName: 'Main Room',
      greenRoomId: GREEN_ROOM_ID,
      greenRoomName: 'Green Room',
      targetRoomId: MAIN_ROOM_ID,
      targetRoomName: 'Main Room',
      movedUsers: 2,
      targetState: 'ONLINE',
      users: [
        { id: DM_ID, username: 'dm-user' },
        { id: PLAYER_ID, username: 'alice' },
      ],
    })

    const response = await request(app)
      .put(`/api/session/${SESSION_ID}/state`)
      .set('Authorization', 'Bearer token')
      .send({ state: 'PAUSED' })

    expect(response.status).toBe(200)
    expect(mocks.mockClearSessionDMOverrideState).toHaveBeenCalledWith(SESSION_ID)
    expect(mocks.mockClearRoomEnvironmentState).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: MAIN_ROOM_ID,
    })
  })

  it('emits CHAT:ROOM_CONTEXT_CLEARED only for ENDED when target is Green Room', async () => {
    const GREEN_ROOM_ID = '55555555-5555-4555-8555-555555555555'
    const MAIN_ROOM_ID = '44444444-4444-4444-8444-444444444444'

    const cases: Array<{
      state: 'PAUSED' | 'ENDED'
      targetRoomId: string
      expectCleared: boolean
    }> = [
      { state: 'PAUSED', targetRoomId: GREEN_ROOM_ID, expectCleared: false },
      { state: 'PAUSED', targetRoomId: MAIN_ROOM_ID, expectCleared: false },
      { state: 'ENDED', targetRoomId: GREEN_ROOM_ID, expectCleared: true },
      { state: 'ENDED', targetRoomId: MAIN_ROOM_ID, expectCleared: false },
    ]

    for (const testCase of cases) {
      const app = buildApp()

      mocks.mockUpdateSessionState.mockResolvedValueOnce({
        id: SESSION_ID,
        name: 'Session 1',
        dmId: DM_ID,
        state: testCase.state,
        createdAt: Date.now(),
        startedAt: Date.now(),
      })

      mocks.mockApplySessionStateRoomTransition.mockResolvedValueOnce({
        mainRoomId: MAIN_ROOM_ID,
        mainRoomName: 'Main Room',
        greenRoomId: GREEN_ROOM_ID,
        greenRoomName: 'Green Room',
        targetRoomId: testCase.targetRoomId,
        targetRoomName: testCase.targetRoomId === GREEN_ROOM_ID ? 'Green Room' : 'Main Room',
        movedUsers: 2,
        targetState: testCase.targetRoomId === GREEN_ROOM_ID ? 'IDLE' : 'ONLINE',
        users: [
          { id: DM_ID, username: 'dm-user' },
          { id: PLAYER_ID, username: 'alice' },
        ],
      })

      const response = await request(app)
        .put(`/api/session/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: testCase.state })

      expect(response.status).toBe(200)

      const wsCalls = (app.locals.wsManager.broadcastEventToSession as any).mock.calls
      const contextClearedEvents = wsCalls.filter(
        ([, event]: any) => event.type === 'CHAT:ROOM_CONTEXT_CLEARED'
      )
      expect(contextClearedEvents).toHaveLength(testCase.expectCleared ? 1 : 0)
    }
  })
})
