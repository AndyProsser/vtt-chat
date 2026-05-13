/**
 * Integration tests for DEV mock takeover routes.
 *
 * Covers:
 * - GET  /dev/mock-players/takeover/status/:sessionId
 * - POST /dev/mock-players/takeover/start
 * - POST /dev/mock-players/takeover/stop
 * - Permission boundaries (unauthenticated, invalid IDs, non-mock target)
 * - Reconnect hydration (status reflects active takeover after start)
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ACTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MOCK_PLAYER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOT_MOCK_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  getSession: vi.fn(),
  getSessionMockPlayerById: vi.fn(),
  getMockTakeover: vi.fn(),
  startMockTakeover: vi.fn(),
  stopMockTakeover: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.extractTokenFromHeader,
  verifyToken: mocks.verifyToken,
}))

vi.mock('@/services/session.service', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/services/dev-mock-players.service', () => ({
  listMockPlayers: vi.fn().mockResolvedValue([]),
  getMockPlayerTokens: vi.fn().mockResolvedValue([]),
  joinMockPlayersToSession: vi.fn().mockResolvedValue(undefined),
  removeMockPlayersFromSession: vi.fn().mockResolvedValue(undefined),
  resetDevMockRoster: vi.fn().mockResolvedValue({ count: 0, removedUsers: [], addedUsers: [] }),
  getSessionMockPlayerById: mocks.getSessionMockPlayerById,
}))

vi.mock('@/services/dev-mock-takeover.service', () => ({
  getMockTakeover: mocks.getMockTakeover,
  startMockTakeover: mocks.startMockTakeover,
  stopMockTakeover: mocks.stopMockTakeover,
  resolveEffectiveActor: vi
    .fn()
    .mockImplementation(async (p: { actorUserId: string; actorUsername: string }) => ({
      userId: p.actorUserId,
      username: p.actorUsername,
    })),
}))

vi.mock('@/services/session-stats.service', () => ({
  broadcastSessionStatsSnapshot: vi.fn().mockResolvedValue(undefined),
}))

import devRoutes from '@/api/dev.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.locals.wsManager = { broadcastEventToSession: vi.fn() }
  app.use('/dev/mock-players', devRoutes)
  return app
}

function authOk() {
  mocks.extractTokenFromHeader.mockReturnValue('token')
  mocks.verifyToken.mockReturnValue({
    userId: ACTOR_ID,
    username: 'alice',
    role: 'PLAYER',
  })
}

const SESSION = { id: SESSION_ID, dmId: 'dm-id', state: 'ACTIVE' }
const MOCK_PLAYER = { id: MOCK_PLAYER_ID, username: 'mock1', displayName: 'Mock One' }
const TAKEOVER_STATE = { assumedUserId: MOCK_PLAYER_ID, startedAt: 1700000000000 }

describe('GET /dev/mock-players/takeover/status/:sessionId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authOk()
    mocks.getSession.mockResolvedValue(SESSION)
  })

  it('returns active=false when no takeover in progress', async () => {
    mocks.getMockTakeover.mockReturnValue(null)

    const res = await request(buildApp())
      .get(`/dev/mock-players/takeover/status/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      sessionId: SESSION_ID,
      active: false,
      assumedUserId: null,
      assumedDisplayName: null,
    })
  })

  it('returns active=true with assumed player details when takeover is running', async () => {
    mocks.getMockTakeover.mockReturnValue(TAKEOVER_STATE)
    mocks.getSessionMockPlayerById.mockResolvedValue(MOCK_PLAYER)

    const res = await request(buildApp())
      .get(`/dev/mock-players/takeover/status/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      sessionId: SESSION_ID,
      active: true,
      assumedUserId: MOCK_PLAYER_ID,
      assumedDisplayName: 'Mock One',
      startedAt: 1700000000000,
    })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.extractTokenFromHeader.mockReturnValue(null)

    const res = await request(buildApp()).get(`/dev/mock-players/takeover/status/${SESSION_ID}`)

    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid sessionId', async () => {
    const res = await request(buildApp())
      .get('/dev/mock-players/takeover/status/not-a-uuid')
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(400)
  })

  it('returns 404 when session does not exist', async () => {
    mocks.getSession.mockResolvedValue(null)

    const res = await request(buildApp())
      .get(`/dev/mock-players/takeover/status/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(404)
  })
})

describe('POST /dev/mock-players/takeover/start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authOk()
    mocks.getSession.mockResolvedValue(SESSION)
    mocks.getSessionMockPlayerById.mockResolvedValue(MOCK_PLAYER)
    mocks.startMockTakeover.mockReturnValue(TAKEOVER_STATE)
  })

  it('starts takeover and returns assumed identity', async () => {
    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/start')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID, targetUserId: MOCK_PLAYER_ID })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      sessionId: SESSION_ID,
      actorUserId: ACTOR_ID,
      assumedUserId: MOCK_PLAYER_ID,
      assumedDisplayName: 'Mock One',
    })
    expect(mocks.startMockTakeover).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      actorUserId: ACTOR_ID,
      assumedUserId: MOCK_PLAYER_ID,
    })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.extractTokenFromHeader.mockReturnValue(null)

    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/start')
      .send({ sessionId: SESSION_ID, targetUserId: MOCK_PLAYER_ID })

    expect(res.status).toBe(401)
    expect(mocks.startMockTakeover).not.toHaveBeenCalled()
  })

  it('returns 400 for missing sessionId', async () => {
    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/start')
      .set('Authorization', 'Bearer token')
      .send({ targetUserId: MOCK_PLAYER_ID })

    expect(res.status).toBe(400)
  })

  it('returns 400 for missing targetUserId', async () => {
    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/start')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid sessionId format', async () => {
    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/start')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: 'bad', targetUserId: MOCK_PLAYER_ID })

    expect(res.status).toBe(400)
  })

  it('returns 404 when session does not exist', async () => {
    mocks.getSession.mockResolvedValue(null)

    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/start')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID, targetUserId: MOCK_PLAYER_ID })

    expect(res.status).toBe(404)
  })

  it('returns 400 when target is not a mock player in this session', async () => {
    mocks.getSessionMockPlayerById.mockResolvedValue(null)

    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/start')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID, targetUserId: NOT_MOCK_ID })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not an eligible mock player/i)
    expect(mocks.startMockTakeover).not.toHaveBeenCalled()
  })
})

describe('POST /dev/mock-players/takeover/stop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authOk()
  })

  it('stops active takeover and returns cleared=true', async () => {
    mocks.stopMockTakeover.mockReturnValue(true)

    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/stop')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      sessionId: SESSION_ID,
      actorUserId: ACTOR_ID,
      cleared: true,
    })
    expect(mocks.stopMockTakeover).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      actorUserId: ACTOR_ID,
    })
  })

  it('returns cleared=false when no takeover was running', async () => {
    mocks.stopMockTakeover.mockReturnValue(false)

    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/stop')
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID })

    expect(res.status).toBe(200)
    expect(res.body.cleared).toBe(false)
  })

  it('returns 401 when not authenticated', async () => {
    mocks.extractTokenFromHeader.mockReturnValue(null)

    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/stop')
      .send({ sessionId: SESSION_ID })

    expect(res.status).toBe(401)
    expect(mocks.stopMockTakeover).not.toHaveBeenCalled()
  })

  it('returns 400 for missing sessionId', async () => {
    const res = await request(buildApp())
      .post('/dev/mock-players/takeover/stop')
      .set('Authorization', 'Bearer token')
      .send({})

    expect(res.status).toBe(400)
  })
})

describe('Reconnect hydration: status reflects takeover started in prior request', () => {
  it('status endpoint returns current in-memory takeover after start/stop cycle', async () => {
    authOk()
    mocks.getSession.mockResolvedValue(SESSION)
    mocks.getSessionMockPlayerById.mockResolvedValue(MOCK_PLAYER)

    // Simulate: start sets state
    mocks.startMockTakeover.mockReturnValue(TAKEOVER_STATE)
    mocks.getMockTakeover.mockReturnValue(TAKEOVER_STATE)

    const statusAfterStart = await request(buildApp())
      .get(`/dev/mock-players/takeover/status/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(statusAfterStart.body.active).toBe(true)
    expect(statusAfterStart.body.assumedUserId).toBe(MOCK_PLAYER_ID)

    // Simulate: stop clears state
    mocks.getMockTakeover.mockReturnValue(null)

    const statusAfterStop = await request(buildApp())
      .get(`/dev/mock-players/takeover/status/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(statusAfterStop.body.active).toBe(false)
    expect(statusAfterStop.body.assumedUserId).toBeNull()
  })
})
