import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockExtractTokenFromHeader: vi.fn(),
  mockVerifyToken: vi.fn(),
  mockPrismaSessionFindUnique: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetSessionUsers: vi.fn(),
  mockGetSessionPresence: vi.fn(),
  mockGetRooms: vi.fn(),
  mockGetRoom: vi.fn(),
  mockJoinRoom: vi.fn(),
  mockGetSessionParticipantProfiles: vi.fn(),
  mockGetMockTakeoverSnapshot: vi.fn(),
  mockGetSessionStatsSnapshot: vi.fn(),
  mockBroadcastSessionStatsSnapshot: vi.fn(),
  mockAppendSessionAuditEvent: vi.fn(),
}))
const mockBroadcastEventToSession = vi.fn()
const mockWSManager = { broadcastEventToSession: mockBroadcastEventToSession }

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.mockExtractTokenFromHeader,
  verifyToken: mocks.mockVerifyToken,
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    session: {
      findUnique: mocks.mockPrismaSessionFindUnique,
    },
  }),
}))

vi.mock('@/services/session/core.service', () => ({
  getSession: mocks.mockGetSession,
  getSessionUsers: mocks.mockGetSessionUsers,
}))

vi.mock('@/services/room.service', () => ({
  ensureSessionDefaultRoomsForSession: vi.fn(),
  ensurePresenceRecoveredFromSnapshots: vi.fn(),
  getSessionPresence: mocks.mockGetSessionPresence,
  getRoom: mocks.mockGetRoom,
  joinRoom: mocks.mockJoinRoom,
  snapshotSessionPresence: vi.fn(),
  updatePresenceState: vi.fn(),
  createRoom: vi.fn(),
  getRoomMemberIds: vi.fn(),
  getRooms: mocks.mockGetRooms,
  leaveRoom: vi.fn(),
}))

vi.mock('@/repositories/session.repository', () => ({
  getSessionParticipantProfiles: mocks.mockGetSessionParticipantProfiles,
}))

vi.mock('@/services/dev-mock/takeover.service', () => ({
  getMockTakeoverSnapshot: mocks.mockGetMockTakeoverSnapshot,
}))

vi.mock('@/services/session/stats.service', () => ({
  getSessionStatsSnapshot: mocks.mockGetSessionStatsSnapshot,
  broadcastSessionStatsSnapshot: mocks.mockBroadcastSessionStatsSnapshot,
}))

vi.mock('@/services/runtime/runtime-streams.service', () => ({
  appendSessionAuditEvent: mocks.mockAppendSessionAuditEvent,
}))

vi.mock('@/repositories/audio.repository', () => ({
  listAudioDMOverridesBySession: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/services/audio/audio-state', () => ({
  removeDMOverrideState: vi.fn().mockResolvedValue(undefined),
  clearRoomEnvironmentState: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/system-messages.service', () => ({
  emitConditionSystemMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/chat.service', () => ({
  clearRoomMessages: vi.fn().mockResolvedValue(undefined),
}))

import presenceRoutes from '@/api/presence.routes'
import roomsRoutes from '@/api/rooms.routes'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ID = '33333333-3333-4333-8333-333333333333'
const ROOM_ID = '44444444-4444-4444-8444-444444444444'
const PREV_ROOM_ID = '55555555-5555-5555-8555-555555555555'
const WHISPER_ROOM_ID = '66666666-6666-4666-8666-666666666666'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/presence', presenceRoutes)
  app.use('/api/rooms', roomsRoutes)
  return app
}

describe('presence/rooms authz', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.mockExtractTokenFromHeader.mockReturnValue('token')
    mocks.mockVerifyToken.mockReturnValue({
      userId: USER_ID,
      username: 'alice',
      role: 'PLAYER',
    })

    mocks.mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      name: 'Session',
      dmId: OTHER_ID,
      state: 'ACTIVE',
      createdAt: Date.now(),
    })

    mocks.mockPrismaSessionFindUnique.mockResolvedValue({
      campaignId: '77777777-7777-4777-8777-777777777777',
    })

    mocks.mockGetSessionPresence.mockResolvedValue([])
    mocks.mockGetRooms.mockResolvedValue([])
    mocks.mockGetRoom.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      sessionId: SESSION_ID,
      name: 'Room B',
      type: 'GROUP',
      createdBy: OTHER_ID,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    mocks.mockJoinRoom.mockResolvedValue({
      sessionId: SESSION_ID,
      userId: USER_ID,
      username: 'alice',
      primaryRoomId: '44444444-4444-4444-8444-444444444444',
      state: 'ONLINE',
      lastSeenAt: Date.now(),
    })
    mocks.mockGetMockTakeoverSnapshot.mockResolvedValue({
      active: false,
      actorUserId: OTHER_ID,
      effectiveUserId: OTHER_ID,
      assumedUserId: null,
      assumedDisplayName: null,
      startedAt: null,
      staleRecovered: false,
    })
    mocks.mockGetSessionStatsSnapshot.mockResolvedValue({
      connectedPlayersWithDm: 2,
      connectedPlayers: 1,
      connectedSpectators: 0,
      connectedTotal: 2,
      updatedAt: Date.now(),
    })
    mocks.mockBroadcastSessionStatsSnapshot.mockResolvedValue(undefined)
    mocks.mockAppendSessionAuditEvent.mockResolvedValue(undefined)
    mocks.mockGetSessionParticipantProfiles.mockResolvedValue({})
    mockBroadcastEventToSession.mockClear()
  })

  it('denies non-members from reading session presence', async () => {
    const app = buildApp()
    mocks.mockGetSessionUsers.mockResolvedValue([{ id: OTHER_ID, username: 'bob', role: 'PLAYER' }])

    const response = await request(app)
      .get(`/api/presence/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('allows members to read rooms and presence', async () => {
    const app = buildApp()
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice', role: 'PLAYER' },
    ])

    const presenceResponse = await request(app)
      .get(`/api/presence/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    const roomsResponse = await request(app)
      .get(`/api/rooms/${SESSION_ID}`)
      .set('Authorization', 'Bearer token')

    expect(presenceResponse.status).toBe(200)
    expect(roomsResponse.status).toBe(200)
  })

  it('denies non-DM users from moving users between rooms', async () => {
    const app = buildApp()

    const response = await request(app)
      .post('/api/rooms/44444444-4444-4444-8444-444444444444/move-user')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
      })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('FORBIDDEN')
  })

  it('allows DM to move session users between rooms', async () => {
    const app = buildApp()
    mocks.mockVerifyToken.mockReturnValue({
      userId: OTHER_ID,
      username: 'dm',
      role: 'DM',
    })
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice', role: 'PLAYER' },
      { id: OTHER_ID, username: 'dm', role: 'DM' },
    ])

    const response = await request(app)
      .post('/api/rooms/44444444-4444-4444-8444-444444444444/move-user')
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
      })

    expect(response.status).toBe(200)
    expect(mocks.mockJoinRoom).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: '44444444-4444-4444-8444-444444444444',
      userId: USER_ID,
      username: 'alice',
      state: 'ONLINE',
    })
    expect(response.body.ok).toBe(true)
  })

  it('emits ROOM:USER_JOINED event with movedBy field when DM moves user', async () => {
    const app = buildApp()
    app.locals.wsManager = mockWSManager

    mocks.mockVerifyToken.mockReturnValue({
      userId: OTHER_ID,
      username: 'dm',
      role: 'DM',
    })
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice', role: 'PLAYER' },
      { id: OTHER_ID, username: 'dm', role: 'DM' },
    ])
    mocks.mockGetSessionPresence.mockResolvedValue([
      {
        userId: USER_ID,
        username: 'alice',
        state: 'ONLINE',
        primaryRoomId: PREV_ROOM_ID,
        lastSeenAt: Date.now(),
      },
    ])

    const response = await request(app)
      .post(`/api/rooms/${ROOM_ID}/move-user`)
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
      })

    expect(response.status).toBe(200)

    const wsCalls = mockBroadcastEventToSession.mock.calls as Array<[string, any]>
    const leftCall = wsCalls.find(([, event]) => event.type === 'ROOM:USER_LEFT')?.[1]
    expect(leftCall.type).toBe('ROOM:USER_LEFT')
    expect(leftCall.payload).toMatchObject({
      roomId: PREV_ROOM_ID,
      userId: USER_ID,
      username: 'alice',
      reason: 'DM_MOVE',
      movedBy: OTHER_ID,
    })

    const joinedCall = wsCalls.find(([, event]) => event.type === 'ROOM:USER_JOINED')?.[1]
    expect(joinedCall.type).toBe('ROOM:USER_JOINED')
    expect(joinedCall.payload).toMatchObject({
      roomId: ROOM_ID,
      userId: USER_ID,
      username: 'alice',
      movedBy: OTHER_ID,
    })

    const emittedTypes = wsCalls.map(([, event]) => event.type)
    expect(emittedTypes.indexOf('ROOM:USER_LEFT')).toBeLessThan(
      emittedTypes.indexOf('ROOM:USER_JOINED')
    )
  })

  it('allows DM to move a whisper participant out of whisper', async () => {
    const app = buildApp()
    app.locals.wsManager = mockWSManager

    mocks.mockVerifyToken.mockReturnValue({
      userId: OTHER_ID,
      username: 'dm',
      role: 'DM',
    })
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice', role: 'PLAYER' },
      { id: OTHER_ID, username: 'dm', role: 'DM' },
    ])
    mocks.mockGetRoom.mockImplementation(async (roomId: string) => {
      if (roomId === WHISPER_ROOM_ID) {
        return {
          id: WHISPER_ROOM_ID,
          sessionId: SESSION_ID,
          name: 'Whisper',
          type: 'PRIVATE',
          createdBy: OTHER_ID,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      }

      return {
        id: ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Room B',
        type: 'GROUP',
        createdBy: OTHER_ID,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    })
    mocks.mockGetSessionPresence.mockResolvedValue([
      {
        userId: USER_ID,
        username: 'alice',
        state: 'ONLINE',
        primaryRoomId: WHISPER_ROOM_ID,
        privateRoomId: null,
        lastSeenAt: Date.now(),
      },
    ])

    const response = await request(app)
      .post(`/api/rooms/${ROOM_ID}/move-user`)
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
      })

    expect(response.status).toBe(200)
    expect(response.body.ok).toBe(true)
    expect(mocks.mockJoinRoom).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      userId: USER_ID,
      username: 'alice',
      state: 'ONLINE',
    })

    const wsCalls = mockBroadcastEventToSession.mock.calls as Array<[string, any]>
    const leftCall = wsCalls.find(([, event]) => event.type === 'ROOM:USER_LEFT')
    expect(leftCall?.[1]?.payload).toMatchObject({
      roomId: WHISPER_ROOM_ID,
      userId: USER_ID,
      username: 'alice',
      reason: 'DM_MOVE',
      movedBy: OTHER_ID,
    })
  })

  it('emits only ROOM:USER_JOINED when moving user from nowhere', async () => {
    const app = buildApp()
    app.locals.wsManager = mockWSManager

    mocks.mockVerifyToken.mockReturnValue({
      userId: OTHER_ID,
      username: 'dm',
      role: 'DM',
    })
    mocks.mockGetSessionUsers.mockResolvedValue([
      { id: USER_ID, username: 'alice', role: 'PLAYER' },
      { id: OTHER_ID, username: 'dm', role: 'DM' },
    ])
    mocks.mockGetSessionPresence.mockResolvedValue([]) // No previous presence

    await request(app)
      .post(`/api/rooms/${ROOM_ID}/move-user`)
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        targetUserId: USER_ID,
      })

    const emittedEvents = mockBroadcastEventToSession.mock.calls.map((call) => call[1])
    const joinedEvents = emittedEvents.filter((event) => event.type === 'ROOM:USER_JOINED')
    expect(joinedEvents.length).toBeGreaterThan(0)
    expect(joinedEvents[0].payload).toMatchObject({
      roomId: ROOM_ID,
      userId: USER_ID,
      username: 'alice',
      movedBy: OTHER_ID,
    })
  })
})
