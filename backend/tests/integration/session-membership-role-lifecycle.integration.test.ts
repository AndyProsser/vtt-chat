import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageType, SessionState } from '@shared'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const CAMPAIGN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'
const ROOM_ID = '44444444-4444-4444-8444-444444444444'

const state = vi.hoisted(() => ({
  members: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      username: 'dm-user',
      role: 'DM',
      createdAt: Date.now(),
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      username: 'player',
      role: 'PLAYER',
      createdAt: Date.now(),
    },
  ] as Array<{
    id: string
    username: string
    role: 'DM' | 'PLAYER' | 'SPECTATOR'
    createdAt: number
  }>,
}))

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  getSession: vi.fn(),
  getSessionUsers: vi.fn(),
  addUserToSession: vi.fn(),
  removeUserFromSession: vi.fn(),
  getRoom: vi.fn(),
  getRooms: vi.fn(),
  getSessionPresence: vi.fn(),
  joinRoom: vi.fn(),
  ensureSessionDefaultRoomsForSession: vi.fn(),
  sendMessage: vi.fn(),
  getMessages: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  getPrismaClient: vi.fn(),
  listSessionLogsForRequester: vi.fn(),
  listSessionUsersForRequester: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.extractTokenFromHeader,
  verifyToken: mocks.verifyToken,
}))

vi.mock('@/services/session-authz.service', () => ({
  resolveRoleForSessionJoin: vi.fn(async () => ({ ok: true, role: 'PLAYER' })),
  resolveEffectiveSessionRole: vi.fn(async () => ({ ok: true, isMember: true, role: 'PLAYER' })),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    session: {
      findUnique: vi.fn(async () => ({ campaignId: CAMPAIGN_ID })),
    },
    campaignMembership: {
      findUnique: vi.fn(async () => ({ role: 'PLAYER' })),
    },
  }),
}))

vi.mock('@/services/session.service', () => ({
  createSession: vi.fn(),
  getSession: mocks.getSession,
  getAllSessions: vi.fn(async () => []),
  updateSessionState: vi.fn(),
  deleteSession: vi.fn(),
  addUserToSession: mocks.addUserToSession,
  removeUserFromSession: mocks.removeUserFromSession,
  getSessionUsers: mocks.getSessionUsers,
}))

vi.mock('@/services/room.service', () => ({
  getRoom: mocks.getRoom,
  getRooms: mocks.getRooms,
  getSessionPresence: mocks.getSessionPresence,
  joinRoom: mocks.joinRoom,
  ensureSessionDefaultRoomsForSession: mocks.ensureSessionDefaultRoomsForSession,
  ensureSessionWhisperRoomForSession: vi.fn(async () => undefined),
  applySessionStateRoomTransition: vi.fn(),
  deletePrivateRoomsForEndedSession: vi.fn(),
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: mocks.sendMessage,
  getMessages: mocks.getMessages,
  editMessage: mocks.editMessage,
  deleteMessage: mocks.deleteMessage,
  clearRoomMessages: vi.fn(),
}))

vi.mock('@/services/system-messages.service', () => ({
  emitSessionBoundarySystemMessage: vi.fn(),
}))

vi.mock('@/services/session-logs.service', () => ({
  logSessionJoin: vi.fn(),
  logSessionLeave: vi.fn(),
  logSessionStateChange: vi.fn(),
}))

vi.mock('@/services/session-access.service', () => ({
  listSessionLogsForRequester: mocks.listSessionLogsForRequester,
  listSessionUsersForRequester: mocks.listSessionUsersForRequester,
}))

import chatRoutes from '@/api/chat.routes'
import sessionRoutes from '@/api/session.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.locals.wsManager = {
    broadcastEventToSession: vi.fn(),
  }
  app.use('/api/chat', chatRoutes)
  app.use('/api/session', sessionRoutes)
  app.use('/api/v1/session', sessionRoutes)
  return app
}

describe('session membership lifecycle authz', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    state.members = [
      { id: DM_ID, username: 'dm-user', role: 'DM', createdAt: Date.now() },
      { id: PLAYER_ID, username: 'player', role: 'PLAYER', createdAt: Date.now() },
    ]

    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: PLAYER_ID,
      username: 'player',
      role: 'PLAYER',
    })

    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      state: SessionState.ACTIVE,
      name: 'Session 1',
      createdAt: Date.now(),
    })

    mocks.getSessionUsers.mockImplementation(async () =>
      state.members.map((member) => ({
        id: member.id,
        username: member.username,
        role: member.role,
        createdAt: member.createdAt,
      }))
    )

    mocks.addUserToSession.mockImplementation(async (_sessionId, user) => {
      const existing = state.members.find((member) => member.id === user.id)
      if (!existing) {
        state.members.push({
          id: user.id,
          username: user.username,
          role: user.role,
          createdAt: user.createdAt,
        })
      }
      return true
    })

    mocks.removeUserFromSession.mockImplementation(async (_sessionId, userId) => {
      const before = state.members.length
      state.members = state.members.filter((member) => member.id !== userId)
      return {
        removed: state.members.length < before,
        promotedSpectator: { promoted: false },
      }
    })

    mocks.getRoom.mockResolvedValue({
      id: ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Main Room',
      type: 'MAIN',
    })

    mocks.getSessionPresence.mockImplementation(async () =>
      state.members
        .filter((member) => member.id !== DM_ID)
        .map((member) => ({
          userId: member.id,
          username: member.username,
          state: 'ONLINE',
          primaryRoomId: ROOM_ID,
          lastSeenAt: Date.now(),
        }))
    )

    mocks.getRooms.mockResolvedValue([
      {
        id: ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Main Room',
        type: 'MAIN',
        createdBy: DM_ID,
        createdAt: Date.now(),
      },
    ])

    mocks.ensureSessionDefaultRoomsForSession.mockResolvedValue(undefined)

    mocks.joinRoom.mockResolvedValue({
      sessionId: SESSION_ID,
      userId: PLAYER_ID,
      username: 'player',
      primaryRoomId: ROOM_ID,
      state: 'ONLINE',
      lastSeenAt: Date.now(),
    })

    mocks.sendMessage.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      authorId: PLAYER_ID,
      authorUsername: 'player',
      content: 'hello',
      type: MessageType.OOC,
      isDmOnly: false,
      createdAt: Date.now(),
    })

    mocks.getMessages.mockResolvedValue([])
    mocks.editMessage.mockResolvedValue(null)
    mocks.deleteMessage.mockResolvedValue(null)
    mocks.listSessionUsersForRequester.mockResolvedValue({
      ok: true,
      users: state.members.map((member) => ({
        id: member.id,
        username: member.username,
        role: member.role,
      })),
    })
  })

  it('rejects role access after leave until user rejoins session', async () => {
    const app = buildApp()

    const idempotentJoin = await request(app)
      .post(`/api/session/${SESSION_ID}/join`)
      .set('Authorization', 'Bearer token')

    expect(idempotentJoin.status).toBe(200)

    const beforeLeave = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'before leave',
        type: MessageType.OOC,
      })

    expect(beforeLeave.status).toBe(201)

    const leaveResponse = await request(app)
      .post(`/api/session/${SESSION_ID}/leave`)
      .set('Authorization', 'Bearer token')

    expect(leaveResponse.status).toBe(200)

    const whileLeft = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'while left',
        type: MessageType.OOC,
      })

    expect(whileLeft.status).toBe(403)
    expect(whileLeft.body.code).toBe('FORBIDDEN')

    const rejoinResponse = await request(app)
      .post(`/api/session/${SESSION_ID}/join`)
      .set('Authorization', 'Bearer token')

    expect(rejoinResponse.status).toBe(200)

    const afterRejoin = await request(app)
      .post('/api/chat/message')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        content: 'after rejoin',
        type: MessageType.OOC,
      })

    expect(afterRejoin.status).toBe(201)
  })

  it('returns members through the v1 /members alias', async () => {
    const app = buildApp()

    const res = await request(app)
      .get(`/api/v1/session/${SESSION_ID}/members`)
      .set('Authorization', 'Bearer token')

    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(2)
    expect(res.body.users[1].id).toBe(PLAYER_ID)
  })

  it('supports join and leave through the v1 /members aliases', async () => {
    state.members = [{ id: DM_ID, username: 'dm-user', role: 'DM', createdAt: Date.now() }]
    const app = buildApp()

    const joinRes = await request(app)
      .post(`/api/v1/session/${SESSION_ID}/members/join`)
      .set('Authorization', 'Bearer token')

    expect(joinRes.status).toBe(200)
    expect(joinRes.body.users.some((user: { id: string }) => user.id === PLAYER_ID)).toBe(true)

    const leaveRes = await request(app)
      .post(`/api/v1/session/${SESSION_ID}/members/leave`)
      .set('Authorization', 'Bearer token')

    expect(leaveRes.status).toBe(200)
    expect(leaveRes.body.users.some((user: { id: string }) => user.id === PLAYER_ID)).toBe(false)
  })
})
