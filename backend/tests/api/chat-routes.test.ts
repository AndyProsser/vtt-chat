import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageType, SessionState } from '@shared'

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  getSession: vi.fn(),
  getSessionUsers: vi.fn(),
  getRoom: vi.fn(),
  getSessionPresence: vi.fn(),
  resolveEffectiveSessionRole: vi.fn(),
  resolveEffectiveActor: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  getMessages: vi.fn(),
  broadcastEventToSession: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.extractTokenFromHeader,
  verifyToken: mocks.verifyToken,
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: mocks.getSession,
  getSessionUsers: mocks.getSessionUsers,
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: mocks.sendMessage,
  editMessage: mocks.editMessage,
  deleteMessage: mocks.deleteMessage,
  getMessages: mocks.getMessages,
}))

vi.mock('@/services/room.service', () => ({
  getRoom: mocks.getRoom,
  getSessionPresence: mocks.getSessionPresence,
}))

vi.mock('@/services/session/authz.service', () => ({
  resolveEffectiveSessionRole: mocks.resolveEffectiveSessionRole,
}))

vi.mock('@/services/dev-mock/takeover.service', () => ({
  resolveEffectiveActor: mocks.resolveEffectiveActor,
}))

import chatRoutes from '@/api/chat.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const DM_ID = '44444444-4444-4444-8444-444444444444'
const ROOM_ID = '55555555-5555-4555-8555-555555555555'
const RECIPIENT_ID = '66666666-6666-4666-8666-666666666666'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.locals.wsManager = {
    broadcastEventToSession: mocks.broadcastEventToSession,
  }
  app.use('/api/chat', chatRoutes)
  return app
}

describe('chat routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'alice',
      role: 'PLAYER',
    })

    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.ACTIVE,
    })

    mocks.getSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice', role: 'PLAYER', createdAt: Date.now() },
      { id: DM_ID, username: 'morgan', role: 'DM', createdAt: Date.now() },
      { id: RECIPIENT_ID, username: 'bea', role: 'PLAYER', createdAt: Date.now() },
    ])

    mocks.getRoom.mockResolvedValue({
      id: ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Main Room',
      type: 'MAIN',
    })

    mocks.getSessionPresence.mockResolvedValue([
      {
        userId: USER_ID,
        username: 'alice',
        state: 'ONLINE',
        primaryRoomId: ROOM_ID,
        privateRoomId: undefined,
        lastSeenAt: Date.now(),
      },
      {
        userId: RECIPIENT_ID,
        username: 'bea',
        state: 'ONLINE',
        primaryRoomId: ROOM_ID,
        privateRoomId: undefined,
        lastSeenAt: Date.now(),
      },
    ])

    mocks.resolveEffectiveSessionRole.mockResolvedValue({
      ok: true,
      role: 'PLAYER',
    })

    mocks.resolveEffectiveActor.mockResolvedValue({
      userId: USER_ID,
      username: 'alice',
    })

    mocks.sendMessage.mockResolvedValue({
      id: MESSAGE_ID,
      sessionId: SESSION_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      content: 'hello',
      type: MessageType.OOC,
      isDmOnly: false,
      isOffTheRecord: false,
      visibleTo: undefined,
      targetIds: undefined,
      createdAt: 1700000000000,
    })

    mocks.editMessage.mockResolvedValue({
      id: MESSAGE_ID,
      sessionId: SESSION_ID,
      content: 'edited',
      visibleTo: [USER_ID],
      editedAt: 1700000000100,
    })

    mocks.deleteMessage.mockResolvedValue({
      id: MESSAGE_ID,
      sessionId: SESSION_ID,
      deletedAt: 1700000000200,
    })

    mocks.getMessages.mockResolvedValue([])
  })

  it('returns 401 when auth header is missing', async () => {
    const app = buildApp()
    mocks.extractTokenFromHeader.mockReturnValue(undefined)

    const response = await request(app).post('/api/chat/message').send({})

    expect(response.status).toBe(401)
    expect(response.body.code).toBe('UNAUTHORIZED')
  })

  it('returns 403 for spectator IC message', async () => {
    const app = buildApp()
    mocks.verifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'watcher',
      role: 'SPECTATOR',
    })
    mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({ ok: true, role: 'SPECTATOR' })

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'in character',
        type: MessageType.IC,
      })

    expect(response.status).toBe(403)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('returns 400 for whisper without valid recipient', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'psst',
        type: MessageType.WHISPER,
      })

    expect(response.status).toBe(400)
    expect(response.body.field).toBe('recipientId')
  })

  it('returns 409 when session is not active', async () => {
    const app = buildApp()
    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.PAUSED,
    })

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'hello',
        type: MessageType.OOC,
      })

    expect(response.status).toBe(409)
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('sends a message and broadcasts websocket event', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'hello world',
        type: MessageType.OOC,
      })

    expect(response.status).toBe(201)
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    expect(mocks.broadcastEventToSession).toHaveBeenCalledTimes(1)
    expect(mocks.sendMessage.mock.calls[0][0].visibleTo).toEqual([DM_ID, USER_ID, RECIPIENT_ID])

    const [sessionIdArg, eventArg] = mocks.broadcastEventToSession.mock.calls[0]
    expect(sessionIdArg).toBe(SESSION_ID)
    expect(eventArg.type).toBe('CHAT:MESSAGE_SENT')
  })

  it('returns session messages for authenticated user', async () => {
    const app = buildApp()
    mocks.getMessages.mockResolvedValue([{ id: MESSAGE_ID }])

    const response = await request(app)
      .get(`/api/chat/messages/${SESSION_ID}`)
      .query({ roomId: ROOM_ID })
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.messages).toEqual([{ id: MESSAGE_ID }])
    expect(mocks.getMessages).toHaveBeenCalledWith(SESSION_ID, USER_ID, 'PLAYER', ROOM_ID)
  })

  it('restricts whisper delivery to sender, recipient, and DM', async () => {
    const app = buildApp()

    mocks.sendMessage.mockResolvedValueOnce({
      id: MESSAGE_ID,
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      content: 'psst',
      type: MessageType.WHISPER,
      isDmOnly: true,
      isOffTheRecord: false,
      visibleTo: [USER_ID, DM_ID, RECIPIENT_ID],
      targetIds: [RECIPIENT_ID],
      createdAt: 1700000000000,
    })

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'psst',
        type: MessageType.WHISPER,
        recipientId: RECIPIENT_ID,
      })

    expect(response.status).toBe(201)
    expect(mocks.sendMessage.mock.calls[0][0].visibleTo).toEqual([USER_ID, DM_ID, RECIPIENT_ID])
    expect(mocks.broadcastEventToSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ type: 'CHAT:MESSAGE_SENT' }),
      [USER_ID, DM_ID, RECIPIENT_ID]
    )
  })

  it('allows the session owner to send chat even when auth role is not DM', async () => {
    const app = buildApp()

    mocks.verifyToken.mockReturnValue({
      userId: DM_ID,
      username: 'morgan',
      role: 'PLAYER',
    })
    mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({ ok: true, role: 'DM' })
    mocks.resolveEffectiveActor.mockResolvedValueOnce({ userId: DM_ID, username: 'morgan' })

    mocks.sendMessage.mockResolvedValueOnce({
      id: MESSAGE_ID,
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      authorId: DM_ID,
      authorUsername: 'morgan',
      content: 'hello from dm',
      type: MessageType.OOC,
      isDmOnly: false,
      visibleTo: undefined,
      createdAt: 1700000000000,
    })

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'hello from dm',
        type: MessageType.OOC,
      })

    expect(response.status).toBe(201)
    expect(mocks.getSessionPresence).toHaveBeenCalledTimes(1)
    expect(mocks.broadcastEventToSession).toHaveBeenCalledTimes(1)

    const [, eventArg] = mocks.broadcastEventToSession.mock.calls[0]
    expect(eventArg.userRole).toBe('DM')
  })

  it('allows the session owner to fetch room chat even when auth role is not DM', async () => {
    const app = buildApp()

    mocks.verifyToken.mockReturnValue({
      userId: DM_ID,
      username: 'morgan',
      role: 'PLAYER',
    })
    mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({ ok: true, role: 'DM' })
    mocks.getMessages.mockResolvedValueOnce([{ id: MESSAGE_ID }])

    const response = await request(app)
      .get(`/api/chat/messages/${SESSION_ID}`)
      .query({ roomId: ROOM_ID })
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mocks.getSessionPresence).not.toHaveBeenCalled()
    expect(mocks.getMessages).toHaveBeenCalledWith(SESSION_ID, DM_ID, 'DM', ROOM_ID)
  })

  it('returns the visible session timeline when roomId is omitted', async () => {
    const app = buildApp()
    mocks.getMessages.mockResolvedValueOnce([{ id: MESSAGE_ID }])

    const response = await request(app)
      .get(`/api/chat/messages/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mocks.getMessages).toHaveBeenCalledWith(SESSION_ID, USER_ID, 'PLAYER', undefined)
    expect(response.body.messages).toEqual([{ id: MESSAGE_ID }])
  })

  it('edits a message and broadcasts update', async () => {
    const app = buildApp()

    const response = await request(app)
      .put(`/api/chat/message/${MESSAGE_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ content: 'edited' })

    expect(response.status).toBe(200)
    expect(mocks.editMessage).toHaveBeenCalledWith(MESSAGE_ID, USER_ID, 'PLAYER', 'edited')
    expect(mocks.broadcastEventToSession).toHaveBeenCalledTimes(1)

    const [, eventArg] = mocks.broadcastEventToSession.mock.calls[0]
    expect(eventArg.type).toBe('CHAT:MESSAGE_EDITED')
  })

  it('deletes a message and broadcasts deletion', async () => {
    const app = buildApp()

    const response = await request(app)
      .delete(`/api/chat/message/${MESSAGE_ID}`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(mocks.deleteMessage).toHaveBeenCalledWith(MESSAGE_ID, USER_ID, 'PLAYER')
    expect(mocks.broadcastEventToSession).toHaveBeenCalledTimes(1)

    const [, eventArg] = mocks.broadcastEventToSession.mock.calls[0]
    expect(eventArg.type).toBe('CHAT:MESSAGE_DELETED')
  })
})
