/**
 * W2: Presence routes – coverage for uncovered paths
 *
 * The existing presence-rooms-authz.test.ts covers the authz guard paths.
 * This file covers the remaining handler logic:
 *  - GET /:sessionId  — 200 with merged profiles, 400, 401, 403
 *  - PUT /:sessionId/state — 200, 400 (uuid, state, roomId), 403, 404 room, WS event emission
 *  - POST /:sessionId/recover — 200, 400, 403
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockGetSessionPresence: vi.fn(),
  mockGetSessionParticipantProfiles: vi.fn(),
  mockGetMockTakeoverSnapshot: vi.fn(),
  mockGetRoom: vi.fn(),
  mockJoinRoom: vi.fn(),
  mockUpdatePresenceState: vi.fn(),
  mockEnsurePresenceRecoveredFromSnapshots: vi.fn(),
  mockSnapshotSessionPresence: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/services/session.service', () => ({
  getSession: mocks.mockGetSession,
  getSessionUsers: mocks.mockGetSessionUsers,
}))

vi.mock('@/services/room.service', () => ({
  getSessionPresence: mocks.mockGetSessionPresence,
  getRoom: mocks.mockGetRoom,
  joinRoom: mocks.mockJoinRoom,
  updatePresenceState: mocks.mockUpdatePresenceState,
  ensurePresenceRecoveredFromSnapshots: mocks.mockEnsurePresenceRecoveredFromSnapshots,
  snapshotSessionPresence: mocks.mockSnapshotSessionPresence,
}))

vi.mock('@/repositories/session.repository', () => ({
  getSessionParticipantProfiles: mocks.mockGetSessionParticipantProfiles,
}))

vi.mock('@/services/dev-mock-takeover.service', () => ({
  getMockTakeoverSnapshot: mocks.mockGetMockTakeoverSnapshot,
}))

import presenceRoutes from '@/api/presence.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const DM_ID = '33333333-3333-4333-8333-333333333333'
const ROOM_ID = '44444444-4444-4444-8444-444444444444'
const PRIVATE_ROOM_ID = '55555555-5555-4555-8555-555555555555'
const INVALID_UUID = 'not-a-uuid'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/presence', presenceRoutes)
  app.use('/api/v1/presence', presenceRoutes)
  return app
}

function buildAppWithWS() {
  const app = buildApp()
  app.locals.wsManager = { broadcastEventToSession: vi.fn() }
  return app
}

describe('presence routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({ userId: USER_ID, username: 'alice', role: 'PLAYER' })
    mocks.mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session',
      dmId: DM_ID,
      state: 'ACTIVE',
      createdAt: Date.now(),
    })
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice', role: 'PLAYER' },
    ])
    mocks.mockGetSessionPresence.mockResolvedValue([])
    mocks.mockGetSessionParticipantProfiles.mockResolvedValue({})
    mocks.mockGetMockTakeoverSnapshot.mockResolvedValue({
      active: false,
      actorUserId: USER_ID,
      effectiveUserId: USER_ID,
      assumedUserId: null,
      assumedDisplayName: null,
      startedAt: null,
      staleRecovered: false,
    })
  })

  // ── GET /:sessionId ──────────────────────────────────────────────────────────

  describe('GET /:sessionId', () => {
    it('returns 401 when no auth token provided', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)
      const app = buildApp()
      const res = await request(app).get(`/api/presence/${SESSION_ID}`)
      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid sessionId uuid', async () => {
      const app = buildApp()
      const res = await request(app)
        .get(`/api/presence/${INVALID_UUID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 403 when user is not a session member', async () => {
      mocks.mockGetSessionUsers.mockResolvedValue([
        { id: 'other-user', username: 'bob', role: 'PLAYER' },
      ])
      const app = buildApp()
      const res = await request(app)
        .get(`/api/presence/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('returns 200 with presence array for a session member', async () => {
      mocks.mockGetSessionPresence.mockResolvedValue([
        {
          userId: USER_ID,
          username: 'alice',
          state: 'ONLINE',
          primaryRoomId: ROOM_ID,
          lastSeenAt: 1700000000000,
        },
      ])
      const app = buildApp()
      const res = await request(app)
        .get(`/api/presence/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(200)
      expect(res.body.presence).toHaveLength(1)
      expect(res.body.presence[0].userId).toBe(USER_ID)
      expect(res.body.identity).toMatchObject({
        active: false,
        actorUserId: USER_ID,
        effectiveUserId: USER_ID,
      })
    })

    it('projects active assumed identity snapshot when takeover is active', async () => {
      mocks.mockGetMockTakeoverSnapshot.mockResolvedValue({
        active: true,
        actorUserId: USER_ID,
        effectiveUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        assumedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        assumedDisplayName: 'Mock Archer',
        startedAt: 1700000000000,
        staleRecovered: false,
      })

      const app = buildApp()
      const res = await request(app)
        .get(`/api/presence/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')

      expect(res.status).toBe(200)
      expect(res.body.identity).toMatchObject({
        active: true,
        assumedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        assumedDisplayName: 'Mock Archer',
      })
    })

    it('marks staleRecovered=true when stale takeover has been auto-cleared', async () => {
      mocks.mockGetMockTakeoverSnapshot.mockResolvedValue({
        active: false,
        actorUserId: USER_ID,
        effectiveUserId: USER_ID,
        assumedUserId: null,
        assumedDisplayName: null,
        startedAt: null,
        staleRecovered: true,
      })

      const app = buildApp()
      const res = await request(app)
        .get(`/api/presence/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')

      expect(res.status).toBe(200)
      expect(res.body.identity).toMatchObject({
        active: false,
        staleRecovered: true,
      })
    })

    it('merges participant profiles into presence entries', async () => {
      mocks.mockGetSessionPresence.mockResolvedValue([
        {
          userId: USER_ID,
          username: 'alice',
          state: 'ONLINE',
          primaryRoomId: ROOM_ID,
          lastSeenAt: 1700000000000,
        },
      ])
      mocks.mockGetSessionParticipantProfiles.mockResolvedValue({
        [USER_ID]: { avatarUrl: 'https://example.com/alice.png', displayName: 'Alice' },
      })
      const app = buildApp()
      const res = await request(app)
        .get(`/api/presence/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(200)
      expect(res.body.presence[0].avatarUrl).toBe('https://example.com/alice.png')
      expect(res.body.presence[0].displayName).toBe('Alice')
    })

    it('serves the same presence data through the v1 mount', async () => {
      mocks.mockGetSessionPresence.mockResolvedValue([
        {
          userId: USER_ID,
          username: 'alice',
          state: 'ONLINE',
          primaryRoomId: ROOM_ID,
          lastSeenAt: 1700000000000,
        },
      ])

      const app = buildApp()
      const res = await request(app)
        .get(`/api/v1/presence/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')

      expect(res.status).toBe(200)
      expect(res.body.presence).toHaveLength(1)
      expect(res.body.presence[0].userId).toBe(USER_ID)
    })

    it('allows DM to read presence even though they are not in session users list', async () => {
      mocks.mockVerifyToken.mockReturnValue({ userId: DM_ID, username: 'gm', role: 'DM' })
      mocks.mockGetSessionUsers.mockResolvedValue([]) // DM is session owner, not in members list
      const app = buildApp()
      const res = await request(app)
        .get(`/api/presence/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(200)
    })
  })

  // ── PUT /:sessionId/state ────────────────────────────────────────────────────

  describe('PUT /:sessionId/state', () => {
    beforeEach(() => {
      mocks.mockUpdatePresenceState.mockResolvedValue({
        sessionId: SESSION_ID,
        userId: USER_ID,
        username: 'alice',
        state: 'ONLINE',
        ghost: false,
        primaryRoomId: ROOM_ID,
        lastSeenAt: 1700000001000,
      })
    })

    it('returns 401 when unauthenticated', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .send({ state: 'ONLINE' })
      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid sessionId', async () => {
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${INVALID_UUID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 400 for invalid presence state value', async () => {
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'FLYING' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 400 for non-uuid roomId', async () => {
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE', roomId: 'not-a-uuid' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 400 for non-uuid privateRoomId', async () => {
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE', privateRoomId: 'not-a-uuid' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 400 for non-boolean ghostMode', async () => {
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE', ghostMode: 'yes' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 403 when not a session member', async () => {
      mocks.mockGetSessionUsers.mockResolvedValue([
        { id: 'other-user', username: 'bob', role: 'PLAYER' },
      ])
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE' })
      expect(res.status).toBe(403)
    })

    it('returns 200 and updated presence without roomId', async () => {
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'IDLE' })
      expect(res.status).toBe(200)
      expect(res.body.presence).toBeDefined()
    })

    it('returns 404 when roomId refers to non-existent room', async () => {
      mocks.mockGetRoom.mockResolvedValue(null)
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE', roomId: ROOM_ID })
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('joins room and updates presence when roomId is valid', async () => {
      mocks.mockGetRoom.mockResolvedValue({
        id: ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Main',
        type: 'MAIN',
        createdBy: DM_ID,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      mocks.mockJoinRoom.mockResolvedValue({
        sessionId: SESSION_ID,
        userId: USER_ID,
        username: 'alice',
        primaryRoomId: ROOM_ID,
        state: 'ONLINE',
        lastSeenAt: 1700000002000,
      })
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE', roomId: ROOM_ID })
      expect(res.status).toBe(200)
      expect(mocks.mockJoinRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: SESSION_ID,
          roomId: ROOM_ID,
          userId: USER_ID,
        })
      )
    })

    it('broadcasts PRESENCE:STATE_CHANGED event when wsManager present', async () => {
      const app = buildAppWithWS()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'IDLE' })
      expect(res.status).toBe(200)
      const wsManager = app.locals.wsManager
      const stateChangedCall = wsManager.broadcastEventToSession.mock.calls.find(
        (call: any[]) => call[1]?.type === 'PRESENCE:STATE_CHANGED'
      )
      expect(stateChangedCall).toBeDefined()
      const [sid, event] = stateChangedCall
      expect(sid).toBe(SESSION_ID)
      expect(event.type).toBe('PRESENCE:STATE_CHANGED')
      expect(event.payload.newState).toBe('ONLINE') // from mock return
    })

    it('includes previousGroupId in PRESENCE:STATE_CHANGED payload when present', async () => {
      mocks.mockUpdatePresenceState.mockResolvedValue({
        sessionId: SESSION_ID,
        userId: USER_ID,
        username: 'alice',
        state: 'ONLINE',
        ghost: false,
        primaryRoomId: ROOM_ID,
        previousGroupId: PRIVATE_ROOM_ID,
        lastSeenAt: 1700000001000,
      })

      const app = buildAppWithWS()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE' })

      expect(res.status).toBe(200)
      const wsManager = app.locals.wsManager
      const stateChangedCall = wsManager.broadcastEventToSession.mock.calls.find(
        (call: any[]) => call[1]?.type === 'PRESENCE:STATE_CHANGED'
      )
      expect(stateChangedCall).toBeDefined()
      expect(stateChangedCall[1].payload.previousGroupId).toBe(PRIVATE_ROOM_ID)
    })

    it('broadcasts PRESENCE:USER_GHOST_MODE_CHANGED when ghost mode flips', async () => {
      mocks.mockGetSessionPresence.mockResolvedValue([
        {
          sessionId: SESSION_ID,
          userId: USER_ID,
          username: 'alice',
          state: 'ONLINE',
          ghost: false,
          primaryRoomId: ROOM_ID,
          lastSeenAt: 1700000000500,
        },
      ])
      mocks.mockUpdatePresenceState.mockResolvedValue({
        sessionId: SESSION_ID,
        userId: USER_ID,
        username: 'alice',
        state: 'ONLINE',
        ghost: true,
        primaryRoomId: ROOM_ID,
        lastSeenAt: 1700000001000,
      })

      const app = buildAppWithWS()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'ONLINE', ghostMode: true })

      expect(res.status).toBe(200)
      const wsManager = app.locals.wsManager
      const ghostModeCall = wsManager.broadcastEventToSession.mock.calls.find(
        (call: any[]) => call[1]?.type === 'PRESENCE:USER_GHOST_MODE_CHANGED'
      )
      expect(ghostModeCall).toBeDefined()
      expect(ghostModeCall[1].payload.ghostMode).toBe(true)
    })

    it('accepts null roomId and null privateRoomId without 400', async () => {
      const app = buildApp()
      const res = await request(app)
        .put(`/api/presence/${SESSION_ID}/state`)
        .set('Authorization', 'Bearer token')
        .send({ state: 'IDLE', roomId: null, privateRoomId: null })
      expect(res.status).toBe(200)
    })
  })

  // ── POST /:sessionId/recover ─────────────────────────────────────────────────

  describe('POST /:sessionId/recover', () => {
    beforeEach(() => {
      mocks.mockEnsurePresenceRecoveredFromSnapshots.mockResolvedValue(true)
      mocks.mockSnapshotSessionPresence.mockResolvedValue(3)
      mocks.mockGetSessionPresence.mockResolvedValue([
        {
          userId: USER_ID,
          username: 'alice',
          state: 'OFFLINE',
          primaryRoomId: ROOM_ID,
          lastSeenAt: 1700000000000,
        },
      ])
    })

    it('returns 401 when unauthenticated', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)
      const app = buildApp()
      const res = await request(app).post(`/api/presence/${SESSION_ID}/recover`)
      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid sessionId', async () => {
      const app = buildApp()
      const res = await request(app)
        .post(`/api/presence/${INVALID_UUID}/recover`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 403 when not a session member', async () => {
      mocks.mockGetSessionUsers.mockResolvedValue([
        { id: 'other-user', username: 'bob', role: 'PLAYER' },
      ])
      const app = buildApp()
      const res = await request(app)
        .post(`/api/presence/${SESSION_ID}/recover`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(403)
    })

    it('returns 200 with recovery result and current presence', async () => {
      const app = buildApp()
      const res = await request(app)
        .post(`/api/presence/${SESSION_ID}/recover`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(200)
      expect(res.body.recoveredFromSnapshots).toBe(true)
      expect(res.body.snapshotCount).toBe(3)
      expect(res.body.presence).toHaveLength(1)
    })

    it('returns 200 when recovery finds nothing to recover', async () => {
      mocks.mockEnsurePresenceRecoveredFromSnapshots.mockResolvedValue(false)
      mocks.mockSnapshotSessionPresence.mockResolvedValue(0)
      mocks.mockGetSessionPresence.mockResolvedValue([])
      const app = buildApp()
      const res = await request(app)
        .post(`/api/presence/${SESSION_ID}/recover`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(200)
      expect(res.body.recoveredFromSnapshots).toBe(false)
      expect(res.body.presence).toHaveLength(0)
    })

    it('supports recovery through the v1 mount', async () => {
      const app = buildApp()
      const res = await request(app)
        .post(`/api/v1/presence/${SESSION_ID}/recover`)
        .set('Authorization', 'Bearer token')

      expect(res.status).toBe(200)
      expect(res.body.recoveredFromSnapshots).toBe(true)
      expect(res.body.snapshotCount).toBe(3)
    })
  })
})
