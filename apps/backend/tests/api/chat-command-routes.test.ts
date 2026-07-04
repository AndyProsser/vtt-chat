/**
 * Chat Command Route Tests
 * Covers /roll command validation, permission gating, and dice execution.
 * All service/repo dependencies are mocked — this tests the route handler logic only.
 */

import express from 'express'
import request from 'supertest'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import chatCommandRoutes from '@/api/chat-command.routes'
import { MessageType, SessionState } from '@shared'

const VALID_SESSION_ID = '11111111-1111-4111-8111-111111111111'
const VALID_ROOM_ID = '22222222-2222-4222-8222-222222222222'
const VALID_USER_ID = '33333333-3333-4333-8333-333333333333'
const VALID_DM_ID = '44444444-4444-4444-8444-444444444444'

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  extractTokenFromHeader: vi.fn(),
  getSession: vi.fn(),
  resolveEffectiveActor: vi.fn(),
  resolveEffectiveSessionRole: vi.fn(),
  getRoom: vi.fn(),
  getSessionPresence: vi.fn(),
  resolveRoomAudience: vi.fn(),
  sendMessage: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  verifyToken: (...args: unknown[]) => mocks.verifyToken(...args),
  extractTokenFromHeader: (...args: unknown[]) => mocks.extractTokenFromHeader(...args),
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: (...args: unknown[]) => mocks.getSession(...args),
}))

vi.mock('@/services/dev-mock/takeover.service', () => ({
  resolveEffectiveActor: (...args: unknown[]) => mocks.resolveEffectiveActor(...args),
}))

vi.mock('@/services/session/authz.service', () => ({
  resolveEffectiveSessionRole: (...args: unknown[]) => mocks.resolveEffectiveSessionRole(...args),
}))

vi.mock('@/services/room.service', () => ({
  getRoom: (...args: unknown[]) => mocks.getRoom(...args),
  getSessionPresence: (...args: unknown[]) => mocks.getSessionPresence(...args),
}))

vi.mock('@/services/chat-visibility.service', () => ({
  resolveRoomAudience: (...args: unknown[]) => mocks.resolveRoomAudience(...args),
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: (...args: unknown[]) => mocks.sendMessage(...args),
}))

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/', chatCommandRoutes)
  return app
}

function authHeader() {
  return { Authorization: 'Bearer valid-token' }
}

describe('POST /api/chat/command', () => {
  let app: express.Application

  beforeEach(() => {
    vi.clearAllMocks()
    app = buildApp()

    mocks.extractTokenFromHeader.mockReturnValue('valid-token')
    mocks.verifyToken.mockReturnValue({ userId: VALID_USER_ID, username: 'Aria', role: 'PLAYER' })
    mocks.getSession.mockResolvedValue({
      id: VALID_SESSION_ID,
      dmId: VALID_DM_ID,
      state: SessionState.ACTIVE,
    })
    mocks.resolveEffectiveActor.mockResolvedValue({
      userId: VALID_USER_ID,
      username: 'Aria',
    })
    mocks.resolveEffectiveSessionRole.mockResolvedValue({
      ok: true,
      role: 'PLAYER',
    })
    mocks.getRoom.mockResolvedValue({
      id: VALID_ROOM_ID,
      sessionId: VALID_SESSION_ID,
      type: 'MAIN',
    })
    mocks.getSessionPresence.mockResolvedValue([
      { userId: VALID_USER_ID, primaryRoomId: VALID_ROOM_ID },
    ])
    mocks.resolveRoomAudience.mockResolvedValue([VALID_USER_ID, VALID_DM_ID])
    mocks.sendMessage.mockResolvedValue({
      id: 'msg-1',
      sessionId: VALID_SESSION_ID,
      roomId: VALID_ROOM_ID,
      authorId: VALID_USER_ID,
      authorUsername: 'Aria',
      content: '🎲 Aria rolled 1d20: 15',
      type: MessageType.ROLL,
      isDmOnly: false,
      isOffTheRecord: false,
      visibleTo: [VALID_USER_ID, VALID_DM_ID],
      metadata: {
        rollResult: {
          kind: 'ROLL_RESULT',
          expression: '1d20',
          rolls: [15],
          modifier: 0,
          total: 15,
        },
      },
      createdAt: Date.now(),
    })
  })

  it('returns 401 when no auth header', async () => {
    mocks.extractTokenFromHeader.mockReturnValue(null)
    const res = await request(app).post('/').send({
      command: 'roll',
      args: '1d20',
      sessionId: VALID_SESSION_ID,
      roomId: VALID_ROOM_ID,
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when command is missing', async () => {
    const res = await request(app)
      .post('/')
      .set(authHeader())
      .send({ args: '1d20', sessionId: VALID_SESSION_ID, roomId: VALID_ROOM_ID })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/missing command/i)
  })

  it('returns 400 for invalid sessionId', async () => {
    const res = await request(app)
      .post('/')
      .set(authHeader())
      .send({ command: 'roll', args: '1d20', sessionId: 'bad-uuid', roomId: VALID_ROOM_ID })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid sessionid/i)
  })

  it('returns 400 for invalid roomId', async () => {
    const res = await request(app)
      .post('/')
      .set(authHeader())
      .send({ command: 'roll', args: '1d20', sessionId: VALID_SESSION_ID, roomId: 'bad-uuid' })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid roomid/i)
  })

  it('returns 404 when session not found', async () => {
    mocks.getSession.mockResolvedValue(null)
    const res = await request(app)
      .post('/')
      .set(authHeader())
      .send({ command: 'roll', args: '1d20', sessionId: VALID_SESSION_ID, roomId: VALID_ROOM_ID })
    expect(res.status).toBe(404)
  })

  it('returns 409 when session is not ACTIVE', async () => {
    mocks.getSession.mockResolvedValue({
      id: VALID_SESSION_ID,
      dmId: VALID_DM_ID,
      state: SessionState.PAUSED,
    })
    const res = await request(app)
      .post('/')
      .set(authHeader())
      .send({ command: 'roll', args: '1d20', sessionId: VALID_SESSION_ID, roomId: VALID_ROOM_ID })
    expect(res.status).toBe(409)
  })

  it('returns 400 for unknown command', async () => {
    const res = await request(app).post('/').set(authHeader()).send({
      command: 'unknownCommand',
      args: '',
      sessionId: VALID_SESSION_ID,
      roomId: VALID_ROOM_ID,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/unknown command/i)
  })

  describe('/roll command', () => {
    it('returns 400 when dice expression is missing', async () => {
      const res = await request(app)
        .post('/')
        .set(authHeader())
        .send({ command: 'roll', args: '', sessionId: VALID_SESSION_ID, roomId: VALID_ROOM_ID })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/usage/i)
    })

    it('returns 400 for invalid dice expression', async () => {
      const res = await request(app).post('/').set(authHeader()).send({
        command: 'roll',
        args: 'notdice',
        sessionId: VALID_SESSION_ID,
        roomId: VALID_ROOM_ID,
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/invalid dice expression/i)
    })

    it('returns 201 and a ROLL message for a valid roll', async () => {
      const res = await request(app)
        .post('/')
        .set(authHeader())
        .send({ command: 'roll', args: '1d20', sessionId: VALID_SESSION_ID, roomId: VALID_ROOM_ID })
      expect(res.status).toBe(201)
      expect(res.body.message.type).toBe(MessageType.ROLL)
      expect(res.body.message.metadata.rollResult.kind).toBe('ROLL_RESULT')
    })

    it('accepts /roll with leading slash', async () => {
      const res = await request(app).post('/').set(authHeader()).send({
        command: '/roll',
        args: '2d6+3',
        sessionId: VALID_SESSION_ID,
        roomId: VALID_ROOM_ID,
      })
      expect(res.status).toBe(201)
    })

    it('returns 403 for spectator role', async () => {
      mocks.resolveEffectiveSessionRole.mockResolvedValue({ ok: true, role: 'SPECTATOR' })
      const res = await request(app)
        .post('/')
        .set(authHeader())
        .send({ command: 'roll', args: '1d20', sessionId: VALID_SESSION_ID, roomId: VALID_ROOM_ID })
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/not available to your role/i)
    })
  })
})
