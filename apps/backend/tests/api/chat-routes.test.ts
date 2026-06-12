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
  getMessagesPage: vi.fn(),
  getCampaignGreenroomMessagesPage: vi.fn(),
  broadcastEventToSession: vi.fn(),
  prismaSessionFindUnique: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    session: {
      findUnique: mocks.prismaSessionFindUnique,
    },
  }),
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
  getMessagesPage: mocks.getMessagesPage,
  getCampaignGreenroomMessagesPage: mocks.getCampaignGreenroomMessagesPage,
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
      name: 'Main',
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

    mocks.getMessagesPage.mockResolvedValue({ messages: [], hasMore: false })
    mocks.getCampaignGreenroomMessagesPage.mockResolvedValue({ messages: [], hasMore: false })
    mocks.prismaSessionFindUnique.mockResolvedValue({
      campaign: { postSessionChatEnabled: true },
    })
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

  it('returns 403 for spectator OOC message during ACTIVE (observe-only)', async () => {
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
        content: 'watching only',
        type: MessageType.OOC,
      })

    expect(response.status).toBe(403)
    expect(response.body.message).toContain('observe-only')
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('allows spectator OOC chat during COOLDOWN when post-session chat is enabled', async () => {
    const app = buildApp()
    mocks.verifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'watcher',
      role: 'SPECTATOR',
    })
    mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({ ok: true, role: 'SPECTATOR' })
    mocks.getSession.mockResolvedValueOnce({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.COOLDOWN,
    })
    mocks.prismaSessionFindUnique.mockResolvedValueOnce({
      campaign: { postSessionChatEnabled: true },
    })

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'good game everyone',
        type: MessageType.OOC,
      })

    expect(response.status).toBe(201)
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('returns 400 for non-OOC chat during COOLDOWN', async () => {
    const app = buildApp()
    mocks.getSession.mockResolvedValueOnce({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.COOLDOWN,
    })
    mocks.prismaSessionFindUnique.mockResolvedValueOnce({
      campaign: { postSessionChatEnabled: true },
    })

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'in character during cooldown',
        type: MessageType.IC,
      })

    expect(response.status).toBe(400)
    expect(response.body.message).toBe('Cooldown chat only supports OOC messages')
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('returns 403 for spectator cooldown chat when campaign disables post-session chat', async () => {
    const app = buildApp()
    mocks.verifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'watcher',
      role: 'SPECTATOR',
    })
    mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({ ok: true, role: 'SPECTATOR' })
    mocks.getSession.mockResolvedValueOnce({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.COOLDOWN,
    })
    mocks.prismaSessionFindUnique.mockResolvedValueOnce({
      campaign: { postSessionChatEnabled: false },
    })

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'farewell',
        type: MessageType.OOC,
      })

    expect(response.status).toBe(403)
    expect(response.body.message).toContain('disabled')
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

  it('allows OOC chat while session is PAUSED', async () => {
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

    expect(response.status).toBe(201)
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('returns 409 for non-OOC chat while session is PAUSED', async () => {
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
        content: 'in character during pause',
        type: MessageType.IC,
      })

    expect(response.status).toBe(409)
    expect(response.body.message).toBe('Only OOC messages are allowed during intermission')
    expect(mocks.sendMessage).not.toHaveBeenCalled()
  })

  it('sends direct messages to the DM without a recipient target', async () => {
    const app = buildApp()

    mocks.sendMessage.mockResolvedValueOnce({
      id: MESSAGE_ID,
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      content: 'psst dm',
      type: MessageType.DM,
      isDmOnly: true,
      isOffTheRecord: false,
      visibleTo: [USER_ID, DM_ID],
      createdAt: 1700000000000,
    })

    const response = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'psst dm',
        type: MessageType.DM,
      })

    expect(response.status).toBe(201)
    expect(mocks.sendMessage.mock.calls[0][0].visibleTo).toEqual([USER_ID, DM_ID])
    expect(mocks.broadcastEventToSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ type: 'CHAT:MESSAGE_SENT' }),
      [USER_ID, DM_ID]
    )
  })

  it('allows whisper-group chat in a private room without a direct recipient', async () => {
    const app = buildApp()

    mocks.getRoom.mockResolvedValueOnce({
      id: ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Whisper Circle',
      type: 'PRIVATE',
    })
    mocks.getSessionPresence.mockResolvedValueOnce([
      {
        userId: USER_ID,
        username: 'alice',
        state: 'ONLINE',
        primaryRoomId: ROOM_ID,
        privateRoomId: ROOM_ID,
        lastSeenAt: Date.now(),
      },
      {
        userId: RECIPIENT_ID,
        username: 'bea',
        state: 'ONLINE',
        primaryRoomId: ROOM_ID,
        privateRoomId: ROOM_ID,
        lastSeenAt: Date.now(),
      },
    ])
    mocks.sendMessage.mockResolvedValueOnce({
      id: MESSAGE_ID,
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      authorId: USER_ID,
      authorUsername: 'alice',
      content: 'whisper circle',
      type: MessageType.WHISPER,
      isDmOnly: true,
      isOffTheRecord: true,
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
        content: 'whisper circle',
        type: MessageType.WHISPER,
      })

    expect(response.status).toBe(201)
    expect(mocks.sendMessage.mock.calls[0][0].isOffTheRecord).toBe(true)
    expect(mocks.sendMessage.mock.calls[0][0].visibleTo).toEqual(
      expect.arrayContaining([USER_ID, DM_ID, RECIPIENT_ID])
    )
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
    mocks.getMessagesPage.mockResolvedValue({
      messages: [{ id: MESSAGE_ID }],
      hasMore: false,
      nextBefore: 1700000000000,
    })

    const response = await request(app)
      .get(`/api/chat/messages/${SESSION_ID}`)
      .query({ roomId: ROOM_ID })
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.messages).toEqual([{ id: MESSAGE_ID }])
    expect(response.body.pagination).toEqual({
      hasMore: false,
      nextBefore: 1700000000000,
    })
    expect(mocks.getMessagesPage).toHaveBeenCalledWith(SESSION_ID, USER_ID, 'PLAYER', ROOM_ID, {
      limit: undefined,
      before: undefined,
      sinceLatestStart: false,
      systemOnly: false,
    })
  })

  it('returns merged campaign greenroom messages when requested', async () => {
    const app = buildApp()
    mocks.getRoom.mockResolvedValueOnce({
      id: ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Green Room',
      type: 'GROUP',
    })
    mocks.getCampaignGreenroomMessagesPage.mockResolvedValueOnce({
      messages: [{ id: MESSAGE_ID }],
      hasMore: true,
      nextBefore: 1700000000000,
    })

    const response = await request(app)
      .get('/api/chat/campaign/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/chat/page')
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(response.body.messages).toEqual([{ id: MESSAGE_ID }])
    expect(response.body.hasMore).toBe(true)
    expect(response.body.nextBefore).toBe(1700000000000)
    expect(mocks.getCampaignGreenroomMessagesPage).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      USER_ID,
      'PLAYER',
      {
        before: undefined,
        limit: 20,
        since: undefined,
      }
    )
    expect(mocks.getMessagesPage).not.toHaveBeenCalledWith(SESSION_ID, USER_ID, 'PLAYER', ROOM_ID)
  })

  it('applies server-side today-only boundary for campaign greenroom pagination', async () => {
    const app = buildApp()
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-15T13:45:20.000Z'))

      mocks.getCampaignGreenroomMessagesPage.mockResolvedValueOnce({
        messages: [{ id: MESSAGE_ID }],
        hasMore: false,
        nextBefore: 1768464000000,
      })

      const response = await request(app)
        .get('/api/chat/campaign/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/chat/page')
        .query({ todayOnly: '1' })
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(200)
      expect(mocks.getCampaignGreenroomMessagesPage).toHaveBeenCalledWith(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        USER_ID,
        'PLAYER',
        {
          before: undefined,
          limit: 20,
          since: Date.UTC(2026, 0, 15, 0, 0, 0, 0),
        }
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('allows the session owner to fetch room chat even when auth role is not DM', async () => {
    const app = buildApp()

    mocks.verifyToken.mockReturnValue({
      userId: DM_ID,
      username: 'morgan',
      role: 'PLAYER',
    })
    mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({ ok: true, role: 'DM' })
    mocks.getMessagesPage.mockResolvedValueOnce({ messages: [{ id: MESSAGE_ID }], hasMore: false })

    const response = await request(app)
      .get(`/api/chat/messages/${SESSION_ID}`)
      .query({ roomId: ROOM_ID })
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mocks.getSessionPresence).not.toHaveBeenCalled()
    expect(mocks.getMessagesPage).toHaveBeenCalledWith(SESSION_ID, USER_ID, 'DM', ROOM_ID, {
      limit: undefined,
      before: undefined,
      sinceLatestStart: false,
      systemOnly: false,
    })
  })

  it('returns the visible session timeline when roomId is omitted', async () => {
    const app = buildApp()
    mocks.getMessagesPage.mockResolvedValueOnce({
      messages: [{ id: MESSAGE_ID }],
      hasMore: false,
      nextBefore: 1700000000000,
    })

    const response = await request(app)
      .get(`/api/chat/messages/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(200)
    expect(mocks.getMessagesPage).toHaveBeenCalledWith(SESSION_ID, USER_ID, 'PLAYER', undefined, {
      limit: undefined,
      before: undefined,
      sinceLatestStart: false,
      systemOnly: false,
    })
    expect(response.body.messages).toEqual([{ id: MESSAGE_ID }])
    expect(response.body.pagination).toEqual({ hasMore: false, nextBefore: 1700000000000 })
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

  describe('campaign membership gates (end-to-end)', () => {
    it('rejects chat from non-member of campaign-backed session', async () => {
      const app = buildApp()
      mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({
        ok: false,
        code: 'FORBIDDEN',
        message: 'You are not a member of this campaign',
      })

      const response = await request(app)
        .post('/api/chat/message')
        .set('Authorization', 'Bearer token')
        .send({
          sessionId: SESSION_ID,
          roomId: ROOM_ID,
          content: 'trying to chat',
          type: MessageType.OOC,
        })

      expect(response.status).toBe(403)
      expect(response.body.code).toBe('FORBIDDEN')
      expect(response.body.message).toBe('You are not a member of this campaign')
      expect(mocks.sendMessage).not.toHaveBeenCalled()
    })

    it('allows chat from campaign member in ACTIVE session', async () => {
      const app = buildApp()
      mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({
        ok: true,
        role: 'PLAYER',
        session: { id: SESSION_ID, dmId: DM_ID, state: SessionState.ACTIVE },
      })

      const response = await request(app)
        .post('/api/chat/message')
        .set('Authorization', 'Bearer token')
        .send({
          sessionId: SESSION_ID,
          roomId: ROOM_ID,
          content: 'hello from member',
          type: MessageType.OOC,
        })

      expect(response.status).toBe(201)
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    })

    it('rejects spectator IC chat in campaign-backed session during ACTIVE', async () => {
      const app = buildApp()
      mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({
        ok: true,
        role: 'SPECTATOR',
        session: { id: SESSION_ID, dmId: DM_ID, state: SessionState.ACTIVE },
      })

      const response = await request(app)
        .post('/api/chat/message')
        .set('Authorization', 'Bearer token')
        .send({
          sessionId: SESSION_ID,
          roomId: ROOM_ID,
          content: 'spectator trying IC',
          type: MessageType.IC,
        })

      expect(response.status).toBe(403)
      expect(mocks.sendMessage).not.toHaveBeenCalled()
    })

    it('allows spectator OOC chat in campaign-backed session during COOLDOWN', async () => {
      const app = buildApp()
      mocks.getSession.mockResolvedValueOnce({
        id: SESSION_ID,
        dmId: DM_ID,
        state: SessionState.COOLDOWN,
      })
      mocks.resolveEffectiveSessionRole.mockResolvedValueOnce({
        ok: true,
        role: 'SPECTATOR',
      })
      mocks.prismaSessionFindUnique.mockResolvedValueOnce({
        campaign: { postSessionChatEnabled: true },
      })

      const response = await request(app)
        .post('/api/chat/message')
        .set('Authorization', 'Bearer token')
        .send({
          sessionId: SESSION_ID,
          roomId: ROOM_ID,
          content: 'spectator during cooldown',
          type: MessageType.OOC,
        })

      expect(response.status).toBe(201)
      expect(mocks.sendMessage).toHaveBeenCalledTimes(1)
    })
  })
})
