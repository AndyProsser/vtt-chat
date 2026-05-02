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
  mockEmitSessionBoundarySystemMessage: vi.fn(),
  mockLogSessionStateChange: vi.fn(),
  mockLogSessionLeave: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session.service', () => ({
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
}))

vi.mock('@/services/system-messages.service', () => ({
  emitSessionBoundarySystemMessage: mocks.mockEmitSessionBoundarySystemMessage,
}))

vi.mock('@/services/session-logs.service', () => ({
  logSessionStateChange: mocks.mockLogSessionStateChange,
  logSessionJoin: vi.fn(),
  logSessionLeave: mocks.mockLogSessionLeave,
  getSessionEventHistory: vi.fn(),
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
    })

    mocks.mockRemoveUserFromSession.mockResolvedValue({
      removed: true,
      promotedSpectator: { promoted: false },
    })
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
})
