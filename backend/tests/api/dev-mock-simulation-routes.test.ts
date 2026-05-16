import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  getMockSimulationStatus: vi.fn(),
  getMockSimulationBounds: vi.fn(),
  getMockDisconnectRealismProfiles: vi.fn(),
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
  stopMockSimulation: vi.fn(),
  updateMockSimulationConfig: vi.fn(),
}))

vi.mock('@/services/dev-mock/players.service', () => ({
  listMockPlayers: vi.fn().mockResolvedValue([]),
  getMockPlayerTokens: vi.fn().mockResolvedValue([]),
  joinMockPlayersToSession: vi.fn().mockResolvedValue(undefined),
  removeMockPlayersFromSession: vi.fn().mockResolvedValue(undefined),
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
  broadcastSessionStatsSnapshot: vi.fn().mockResolvedValue(undefined),
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
      messagesSentLastMinuteByType: { IC: 1, OOC: 2, WHISPER: 0 },
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
