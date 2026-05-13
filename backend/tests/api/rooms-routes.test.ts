/**
 * W2: Rooms routes – coverage for uncovered paths
 *
 * The existing presence-rooms-authz.test.ts covers GET /:sessionId authz and
 * move-user. This file covers the remaining handler logic:
 *  - GET /:sessionId         — 200 with rooms, 400, 401, 403
 *  - POST /                  — 201 create room, 400, 401, 403 non-DM, 404 session not found
 *  - POST /:roomId/join      — 200, 400, 401, 403, 404 room, WS event
 *  - POST /:roomId/leave     — 200, 400, 401, 403, 404 room, WS event
 */

import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockGetRooms: vi.fn(),
  mockGetRoom: vi.fn(),
  mockCreateRoom: vi.fn(),
  mockJoinRoom: vi.fn(),
  mockLeaveRoom: vi.fn(),
  mockDeleteRoom: vi.fn(),
  mockGetSessionPresence: vi.fn(),
  mockEnsureSessionDefaultRoomsForSession: vi.fn(),
  mockRoomMemberIds: vi.fn(),
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
  getRooms: mocks.mockGetRooms,
  getRoom: mocks.mockGetRoom,
  createRoom: mocks.mockCreateRoom,
  joinRoom: mocks.mockJoinRoom,
  leaveRoom: mocks.mockLeaveRoom,
  deleteRoom: mocks.mockDeleteRoom,
  getSessionPresence: mocks.mockGetSessionPresence,
  ensureSessionDefaultRoomsForSession: mocks.mockEnsureSessionDefaultRoomsForSession,
  getRoomMemberIds: mocks.mockRoomMemberIds,
}))

import roomsRoutes from '@/api/rooms.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'
const ROOM_ID = '44444444-4444-4444-8444-444444444444'
const INVALID_UUID = 'not-a-uuid'

const ROOM_FIXTURE = {
  id: ROOM_ID,
  sessionId: SESSION_ID,
  name: 'Main Room',
  type: 'MAIN',
  createdBy: DM_ID,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
}

const GROUP_ROOM_FIXTURE = {
  id: ROOM_ID,
  sessionId: SESSION_ID,
  name: 'Side Room',
  type: 'GROUP',
  createdBy: DM_ID,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
}

const SESSION_FIXTURE = {
  id: SESSION_ID,
  name: 'Session 1',
  dmId: DM_ID,
  state: 'ACTIVE',
  createdAt: 1700000000000,
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/rooms', roomsRoutes)
  return app
}

function buildAppWithWS() {
  const app = buildApp()
  app.locals.wsManager = { broadcastEventToSession: vi.fn() }
  return app
}

describe('rooms routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({ userId: DM_ID, username: 'gm', role: 'DM' })
    mocks.mockGetSession.mockResolvedValue(SESSION_FIXTURE)
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: DM_ID, username: 'gm', role: 'DM' },
      { id: PLAYER_ID, username: 'alice', role: 'PLAYER' },
    ])
    mocks.mockGetRooms.mockResolvedValue([ROOM_FIXTURE])
    mocks.mockGetRoom.mockResolvedValue(ROOM_FIXTURE)
    mocks.mockEnsureSessionDefaultRoomsForSession.mockResolvedValue(undefined)
    mocks.mockGetSessionPresence.mockResolvedValue([])
    mocks.mockDeleteRoom.mockResolvedValue(undefined)
    mocks.mockRoomMemberIds.mockResolvedValue([])
  })

  // ── GET /:sessionId ──────────────────────────────────────────────────────────

  describe('GET /:sessionId', () => {
    it('returns 401 when unauthenticated', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)
      const app = buildApp()
      const res = await request(app).get(`/api/rooms/${SESSION_ID}`)
      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid sessionId', async () => {
      const app = buildApp()
      const res = await request(app)
        .get(`/api/rooms/${INVALID_UUID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 403 when user is not a session member', async () => {
      mocks.mockVerifyToken.mockReturnValue({ userId: 'outsider', username: 'eve', role: 'PLAYER' })
      mocks.mockGetSession.mockResolvedValue({ ...SESSION_FIXTURE, dmId: DM_ID })
      const app = buildApp()
      const res = await request(app)
        .get(`/api/rooms/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(403)
    })

    it('returns 200 with rooms array for authorized user', async () => {
      const app = buildApp()
      const res = await request(app)
        .get(`/api/rooms/${SESSION_ID}`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(200)
      expect(res.body.rooms).toHaveLength(1)
      expect(res.body.rooms[0].id).toBe(ROOM_ID)
    })

    it('calls ensureSessionDefaultRoomsForSession before returning rooms', async () => {
      const app = buildApp()
      await request(app).get(`/api/rooms/${SESSION_ID}`).set('Authorization', 'Bearer token')
      expect(mocks.mockEnsureSessionDefaultRoomsForSession).toHaveBeenCalledWith(SESSION_ID, DM_ID)
    })
  })

  // ── POST / (create room) ─────────────────────────────────────────────────────

  describe('POST /', () => {
    beforeEach(() => {
      mocks.mockCreateRoom.mockResolvedValue({
        ...ROOM_FIXTURE,
        name: 'Side Room',
        type: 'GROUP',
      })
    })

    it('returns 401 when unauthenticated', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)
      const app = buildApp()
      const res = await request(app)
        .post('/api/rooms')
        .send({ sessionId: SESSION_ID, name: 'Room', type: 'GROUP' })
      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid sessionId', async () => {
      const app = buildApp()
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: INVALID_UUID, name: 'Room', type: 'GROUP' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 400 for invalid room name', async () => {
      const app = buildApp()
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID, name: '', type: 'GROUP' })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 404 when session does not exist', async () => {
      mocks.mockGetSession.mockResolvedValue(null)
      const app = buildApp()
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID, name: 'Side Room', type: 'GROUP' })
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('SESSION_NOT_FOUND')
    })

    it('returns 403 when non-DM user tries to create a room', async () => {
      mocks.mockVerifyToken.mockReturnValue({
        userId: PLAYER_ID,
        username: 'alice',
        role: 'PLAYER',
      })
      const app = buildApp()
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID, name: 'Side Room', type: 'GROUP' })
      expect(res.status).toBe(403)
      expect(res.body.code).toBe('FORBIDDEN')
    })

    it('returns 201 and the created room for a DM', async () => {
      const app = buildApp()
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID, name: 'Side Room', type: 'GROUP' })
      expect(res.status).toBe(201)
      expect(res.body.room).toBeDefined()
      expect(res.body.room.name).toBe('Side Room')
    })

    it('emits ROOM:CREATED event when wsManager is present', async () => {
      const app = buildAppWithWS()
      await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID, name: 'Side Room', type: 'GROUP' })
      const wsManager = app.locals.wsManager
      expect(wsManager.broadcastEventToSession).toHaveBeenCalledOnce()
      const [sid, event] = wsManager.broadcastEventToSession.mock.calls[0]
      expect(sid).toBe(SESSION_ID)
      expect(event.type).toBe('ROOM:CREATED')
      expect(event.payload.name).toBe('Side Room')
    })

    it('defaults to GROUP type when no type is specified', async () => {
      const app = buildApp()
      await request(app)
        .post('/api/rooms')
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID, name: 'Side Room' })
      expect(mocks.mockCreateRoom).toHaveBeenCalledWith(expect.objectContaining({ type: 'GROUP' }))
    })
  })

  // ── POST /:roomId/join ───────────────────────────────────────────────────────

  describe('POST /:roomId/join', () => {
    beforeEach(() => {
      mocks.mockJoinRoom.mockResolvedValue({
        sessionId: SESSION_ID,
        userId: PLAYER_ID,
        username: 'alice',
        primaryRoomId: ROOM_ID,
        state: 'ONLINE',
        lastSeenAt: 1700000002000,
      })
      mocks.mockVerifyToken.mockReturnValue({
        userId: PLAYER_ID,
        username: 'alice',
        role: 'PLAYER',
      })
    })

    it('returns 401 when unauthenticated', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)
      const app = buildApp()
      const res = await request(app).post(`/api/rooms/${ROOM_ID}/join`)
      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid roomId', async () => {
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${INVALID_UUID}/join`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 404 when room does not exist', async () => {
      mocks.mockGetRoom.mockResolvedValue(null)
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${ROOM_ID}/join`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('returns 403 when user is not a session member', async () => {
      mocks.mockVerifyToken.mockReturnValue({ userId: 'outsider', username: 'eve', role: 'PLAYER' })
      mocks.mockGetSession.mockResolvedValue({ ...SESSION_FIXTURE, dmId: DM_ID })
      mocks.mockGetSessionUsers.mockResolvedValue([{ id: DM_ID, username: 'gm', role: 'DM' }])
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${ROOM_ID}/join`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(403)
    })

    it('returns 200 and presence on successful join', async () => {
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${ROOM_ID}/join`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
      expect(res.body.presence).toBeDefined()
    })

    it('emits ROOM:USER_JOINED event when wsManager is present', async () => {
      const app = buildAppWithWS()
      await request(app).post(`/api/rooms/${ROOM_ID}/join`).set('Authorization', 'Bearer token')
      const wsManager = app.locals.wsManager
      expect(wsManager.broadcastEventToSession).toHaveBeenCalled()
      const roomJoinedCall = wsManager.broadcastEventToSession.mock.calls.find(
        ([, event]: [string, { type?: string }]) => event?.type === 'ROOM:USER_JOINED'
      )
      expect(roomJoinedCall).toBeDefined()
      const [sid, event] = roomJoinedCall
      expect(sid).toBe(SESSION_ID)
      expect(event.type).toBe('ROOM:USER_JOINED')
      expect(event.payload.userId).toBe(PLAYER_ID)
    })

    it('returns 404 when joinRoom returns null (room concurrently deleted)', async () => {
      mocks.mockJoinRoom.mockResolvedValue(null)
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${ROOM_ID}/join`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(404)
    })
  })

  // ── POST /:roomId/leave ──────────────────────────────────────────────────────

  describe('POST /:roomId/leave', () => {
    beforeEach(() => {
      mocks.mockLeaveRoom.mockResolvedValue({
        sessionId: SESSION_ID,
        userId: PLAYER_ID,
        username: 'alice',
        primaryRoomId: null,
        state: 'IDLE',
        lastSeenAt: 1700000003000,
      })
      mocks.mockVerifyToken.mockReturnValue({
        userId: PLAYER_ID,
        username: 'alice',
        role: 'PLAYER',
      })
    })

    it('returns 401 when unauthenticated', async () => {
      mocks.mockExtractTokenFromHeader.mockReturnValue(null)
      const app = buildApp()
      const res = await request(app).post(`/api/rooms/${ROOM_ID}/leave`)
      expect(res.status).toBe(401)
    })

    it('returns 400 for invalid roomId', async () => {
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${INVALID_UUID}/leave`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(400)
      expect(res.body.code).toBe('INVALID_INPUT')
    })

    it('returns 404 when room does not exist', async () => {
      mocks.mockGetRoom.mockResolvedValue(null)
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${ROOM_ID}/leave`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('returns 403 when user is not a session member', async () => {
      mocks.mockVerifyToken.mockReturnValue({ userId: 'outsider', username: 'eve', role: 'PLAYER' })
      mocks.mockGetSession.mockResolvedValue({ ...SESSION_FIXTURE, dmId: DM_ID })
      mocks.mockGetSessionUsers.mockResolvedValue([{ id: DM_ID, username: 'gm', role: 'DM' }])
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${ROOM_ID}/leave`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(403)
    })

    it('returns 200 and presence on successful leave', async () => {
      const app = buildApp()
      const res = await request(app)
        .post(`/api/rooms/${ROOM_ID}/leave`)
        .set('Authorization', 'Bearer token')
      expect(res.status).toBe(200)
      expect(res.body.ok).toBe(true)
    })

    it('emits ROOM:USER_LEFT event when wsManager is present', async () => {
      const app = buildAppWithWS()
      await request(app).post(`/api/rooms/${ROOM_ID}/leave`).set('Authorization', 'Bearer token')
      const wsManager = app.locals.wsManager
      expect(wsManager.broadcastEventToSession).toHaveBeenCalled()
      const roomLeftCall = wsManager.broadcastEventToSession.mock.calls.find(
        ([, event]: [string, { type?: string }]) => event?.type === 'ROOM:USER_LEFT'
      )
      expect(roomLeftCall).toBeDefined()
      const [sid, event] = roomLeftCall
      expect(sid).toBe(SESSION_ID)
      expect(event.type).toBe('ROOM:USER_LEFT')
      expect(event.payload.reason).toBe('VOLUNTARY')
    })
  })

  describe('DELETE /:roomId', () => {
    it('moves members to main room before deleting', async () => {
      mocks.mockGetRoom.mockResolvedValue(GROUP_ROOM_FIXTURE)
      mocks.mockGetRooms.mockResolvedValue([ROOM_FIXTURE, GROUP_ROOM_FIXTURE])
      mocks.mockRoomMemberIds.mockResolvedValue([PLAYER_ID])
      mocks.mockJoinRoom.mockResolvedValue({
        sessionId: SESSION_ID,
        userId: PLAYER_ID,
        username: 'alice',
        primaryRoomId: ROOM_FIXTURE.id,
        state: 'ONLINE',
        lastSeenAt: 1700000010000,
      })

      const app = buildApp()
      const res = await request(app)
        .delete(`/api/rooms/${GROUP_ROOM_FIXTURE.id}`)
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID })

      expect(res.status).toBe(200)
      expect(mocks.mockJoinRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: SESSION_ID,
          roomId: ROOM_FIXTURE.id,
          userId: PLAYER_ID,
          username: 'alice',
        })
      )
      expect(mocks.mockDeleteRoom).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        roomId: GROUP_ROOM_FIXTURE.id,
      })
    })

    it('returns 400 when attempting to delete greenroom', async () => {
      mocks.mockGetRoom.mockResolvedValue({
        ...GROUP_ROOM_FIXTURE,
        name: 'Green Room',
      })

      const app = buildApp()
      const res = await request(app)
        .delete(`/api/rooms/${GROUP_ROOM_FIXTURE.id}`)
        .set('Authorization', 'Bearer token')
        .send({ sessionId: SESSION_ID })

      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Greenroom cannot be deleted/i)
    })
  })
})
