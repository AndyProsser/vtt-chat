import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MOCK_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const ROOM_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  getMockSimulationStatus: vi.fn(),
  getMockSimulationBounds: vi.fn(),
  getMockDisconnectRealismProfiles: vi.fn(),
  stopMockSimulation: vi.fn(),
  disableMockSimulationForSessionExit: vi.fn(),
  removeMockPlayersFromSession: vi.fn(),
  broadcastSessionStatsSnapshot: vi.fn(),
  getSession: vi.fn(),
  getSessionPresence: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.extractTokenFromHeader,
  verifyToken: mocks.verifyToken,
}))

vi.mock('@/services/dev-mock/simulation.service', () => ({
  getMockDisconnectRealismProfiles: mocks.getMockDisconnectRealismProfiles,
  getMockSimulationBounds: mocks.getMockSimulationBounds,
  getMockSimulationPlayerCount: vi.fn(),
  getMockSimulationStatus: mocks.getMockSimulationStatus,
  disableMockSimulationForSessionExit: mocks.disableMockSimulationForSessionExit,
  stopMockSimulation: mocks.stopMockSimulation,
  updateMockSimulationConfig: vi.fn(),
}))

vi.mock('@/services/dev-mock/players.service', () => ({
  listMockPlayers: vi.fn().mockResolvedValue([]),
  getMockPlayerTokens: vi.fn().mockResolvedValue([]),
  joinMockPlayersToSession: vi.fn().mockResolvedValue(undefined),
  removeMockPlayersFromSession: mocks.removeMockPlayersFromSession,
  resetDevMockRoster: vi.fn().mockResolvedValue({ count: 0, removedUsers: [], addedUsers: [] }),
  getSessionMockPlayerById: vi.fn(),
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/services/session/authz.service', () => ({
  resolveEffectiveSessionRole: vi.fn().mockResolvedValue({ ok: true, role: 'PLAYER' }),
}))

vi.mock('@/services/room.service', () => ({
  getSessionPresence: mocks.getSessionPresence,
}))

vi.mock('@/services/session/stats.service', () => ({
  broadcastSessionStatsSnapshot: mocks.broadcastSessionStatsSnapshot,
}))

vi.mock('@/services/dev-mock/takeover.service', () => ({
  getMockTakeoverSnapshot: vi.fn(),
  startMockTakeover: vi.fn(),
  stopMockTakeover: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    error: mocks.loggerError,
  },
}))

import devRoutes from '@/api/dev.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/dev/mock-players', devRoutes)
  return app
}

describe('GET /dev/mock-players/simulation/status/:sessionId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      username: 'alice',
      role: 'PLAYER',
    })
    mocks.getMockSimulationBounds.mockReturnValue({ min: 1, max: 9 })
    mocks.getMockDisconnectRealismProfiles.mockReturnValue({
      BALANCED: {
        disconnectChancePerTick: 0.18,
        ghostMinDurationMs: 2500,
        ghostMaxDurationMs: 7000,
      },
    })
    mocks.stopMockSimulation.mockResolvedValue(undefined)
    mocks.disableMockSimulationForSessionExit.mockResolvedValue(undefined)
    mocks.removeMockPlayersFromSession.mockResolvedValue(undefined)
    mocks.broadcastSessionStatsSnapshot.mockResolvedValue(undefined)
  })

  it('returns status payload when simulation service resolves', async () => {
    mocks.getMockSimulationStatus.mockResolvedValue({
      sessionId: SESSION_ID,
      config: {
        speakingSimulatorEnabled: true,
        chatSimulatorEnabled: true,
        disconnectSimulatorEnabled: false,
        playerCount: 8,
      },
      isRunning: true,
      activeMockCount: 8,
      speakingNow: [],
      uptime: 1200,
      messagesSentLastMinuteByType: { IC: 1, OOC: 2, WHISPER: 0, DM: 1 },
    })

    const res = await request(buildApp())
      .get(`/dev/mock-players/simulation/status/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      sessionId: SESSION_ID,
      isRunning: true,
      bounds: { min: 1, max: 9 },
    })
  })

  it('returns 503 with stable error payload when simulation service throws', async () => {
    mocks.getMockSimulationStatus.mockRejectedValue(new Error('tick failed'))

    const res = await request(buildApp())
      .get(`/dev/mock-players/simulation/status/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(503)
    expect(res.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      error: 'Mock simulation status temporarily unavailable',
    })
    expect(mocks.loggerError).toHaveBeenCalled()
  })
})

describe('POST /dev/mock-players/disconnect-all', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      username: 'alice',
      role: 'DM',
    })
    mocks.stopMockSimulation.mockResolvedValue(undefined)
    mocks.disableMockSimulationForSessionExit.mockResolvedValue(undefined)
    mocks.removeMockPlayersFromSession.mockResolvedValue(undefined)
    mocks.broadcastSessionStatsSnapshot.mockResolvedValue(undefined)
    mocks.getSession.mockResolvedValue({ dmId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    mocks.getSessionPresence.mockResolvedValue([
      {
        userId: MOCK_USER_ID,
        username: 'dev_mock_alpha',
        primaryRoomId: ROOM_ID,
      },
      {
        userId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        username: 'real_player',
        primaryRoomId: ROOM_ID,
      },
    ])
  })

  it('broadcasts ROOM:USER_LEFT for removed mock users when wsManager is attached', async () => {
    const app = buildApp()
    app.locals.wsManager = { broadcastEventToSession: vi.fn() }

    const res = await request(app)
      .post('/dev/mock-players/disconnect-all')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID })

    expect(res.status).toBe(200)
    expect(mocks.stopMockSimulation).toHaveBeenCalledWith(SESSION_ID)
    expect(mocks.removeMockPlayersFromSession).toHaveBeenCalledWith(SESSION_ID)

    const wsCalls = app.locals.wsManager.broadcastEventToSession.mock.calls as Array<
      [string, { type: string; payload?: { userId?: string; reason?: string } }]
    >

    const roomLeftCall = wsCalls.find(([, event]) => event.type === 'ROOM:USER_LEFT')
    expect(roomLeftCall).toBeDefined()
    expect(roomLeftCall?.[0]).toBe(SESSION_ID)
    expect(roomLeftCall?.[1]?.payload?.userId).toBe(MOCK_USER_ID)
    expect(roomLeftCall?.[1]?.payload?.reason).toBe('dev_mock_reroll')
  })
})
