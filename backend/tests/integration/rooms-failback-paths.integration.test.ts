import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PresenceState, RoomType } from '@shared'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'
const MAIN_ROOM_ID = '44444444-4444-4444-8444-444444444444'
const GROUP_ROOM_ID = '55555555-5555-4555-8555-555555555555'
const PRIVATE_ROOM_ID = '66666666-6666-4666-8666-666666666666'
const MISSING_ROOM_ID = '77777777-7777-4777-8777-777777777777'
const ORPHANED_ROOM_ID = '88888888-8888-4888-8888-888888888888'

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  getSession: vi.fn(),
  getSessionUsers: vi.fn(),
  clearRoomMessages: vi.fn(),
  closeRoom: vi.fn(),
  createRoom: vi.fn(),
  deleteRoom: vi.fn(),
  endWhisperBubbleForSession: vi.fn(),
  ensureSessionDefaultRoomsForSession: vi.fn(),
  getRoom: vi.fn(),
  getRoomMemberIds: vi.fn(),
  getSessionPresence: vi.fn(),
  getRooms: vi.fn(),
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  updatePresenceState: vi.fn(),
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
  clearRoomMessages: mocks.clearRoomMessages,
}))

vi.mock('@/services/runtime/runtime-streams.service', () => ({
  appendSessionAuditEvent: vi.fn(),
  appendChatRuntimeEvent: vi.fn(),
}))

vi.mock('@/services/dev-mock/simulation.service', () => ({
  disableMockSimulationForSessionExit: vi.fn(),
  purgeMockSimulationSessionState: vi.fn(),
}))

vi.mock('@/services/room.service', () => ({
  closeRoom: mocks.closeRoom,
  createRoom: mocks.createRoom,
  deleteRoom: mocks.deleteRoom,
  endWhisperBubbleForSession: mocks.endWhisperBubbleForSession,
  ensureSessionDefaultRoomsForSession: mocks.ensureSessionDefaultRoomsForSession,
  getRoom: mocks.getRoom,
  getRoomMemberIds: mocks.getRoomMemberIds,
  getSessionPresence: mocks.getSessionPresence,
  getRooms: mocks.getRooms,
  joinRoom: mocks.joinRoom,
  leaveRoom: mocks.leaveRoom,
  updatePresenceState: mocks.updatePresenceState,
}))

import roomsRoutes from '@/api/rooms.routes'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.locals.wsManager = {
    broadcastEventToSession: vi.fn(),
  }
  app.use('/api/rooms', roomsRoutes)
  return app
}

describe('room failback integration paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: DM_ID,
      username: 'dm',
      role: 'DM',
    })

    mocks.getSession.mockResolvedValue({
      id: SESSION_ID,
      dmId: DM_ID,
      name: 'Session 1',
      state: 'ACTIVE',
      createdAt: Date.now(),
    })

    mocks.getSessionUsers.mockResolvedValue([
      { id: DM_ID, username: 'dm', role: 'DM' },
      { id: PLAYER_ID, username: 'player-one', role: 'PLAYER' },
    ])

    mocks.getRooms.mockResolvedValue([
      {
        id: MAIN_ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Main Room',
        type: RoomType.MAIN,
        createdBy: DM_ID,
        createdAt: Date.now(),
      },
      {
        id: GROUP_ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Scout Team',
        type: RoomType.GROUP,
        createdBy: DM_ID,
        createdAt: Date.now(),
      },
      {
        id: PRIVATE_ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Whisper',
        type: RoomType.PRIVATE,
        createdBy: DM_ID,
        createdAt: Date.now(),
      },
    ])

    mocks.getSessionPresence.mockResolvedValue([
      {
        userId: PLAYER_ID,
        username: 'player-one',
        state: PresenceState.ONLINE,
        primaryRoomId: GROUP_ROOM_ID,
        privateRoomId: null,
        lastSeenAt: Date.now(),
      },
    ])

    mocks.joinRoom.mockResolvedValue({
      sessionId: SESSION_ID,
      userId: PLAYER_ID,
      username: 'player-one',
      primaryRoomId: MAIN_ROOM_ID,
      campaignId: null,
      state: PresenceState.ONLINE,
      lastSeenAt: Date.now(),
    })

    mocks.getRoomMemberIds.mockResolvedValue([])
    mocks.updatePresenceState.mockResolvedValue(undefined)
    mocks.clearRoomMessages.mockResolvedValue(undefined)
    mocks.closeRoom.mockResolvedValue({ movedUsers: [], movedUserIds: [] })
    mocks.deleteRoom.mockResolvedValue(undefined)
    mocks.ensureSessionDefaultRoomsForSession.mockResolvedValue(undefined)
    mocks.endWhisperBubbleForSession.mockResolvedValue([
      {
        userId: PLAYER_ID,
        username: 'player-one',
        fromRoomId: PRIVATE_ROOM_ID,
        toRoomId: MAIN_ROOM_ID,
      },
    ])
  })

  it('falls back to MAIN when move target room is missing', async () => {
    mocks.getRoom.mockImplementation(async (roomId: string) => {
      if (roomId === MISSING_ROOM_ID) {
        return null
      }
      if (roomId === GROUP_ROOM_ID) {
        return {
          id: GROUP_ROOM_ID,
          sessionId: SESSION_ID,
          name: 'Scout Team',
          type: RoomType.GROUP,
        }
      }
      return {
        id: MAIN_ROOM_ID,
        sessionId: SESSION_ID,
        name: 'Main Room',
        type: RoomType.MAIN,
      }
    })

    const app = buildApp()
    const res = await request(app)
      .post(`/api/rooms/${MISSING_ROOM_ID}/members/move`)
      .set('Authorization', 'Bearer token')
      .send({
        sessionId: SESSION_ID,
        targetUserId: PLAYER_ID,
      })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.movedToRoomId).toBe(MAIN_ROOM_ID)
    expect(mocks.joinRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: MAIN_ROOM_ID,
        userId: PLAYER_ID,
      })
    )
  })

  it('reconciles invalid primary room presence to MAIN and emits WS sync events on group delete', async () => {
    mocks.getRoom.mockResolvedValue({
      id: GROUP_ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Scout Team',
      type: RoomType.GROUP,
    })

    mocks.getSessionPresence.mockResolvedValue([
      {
        userId: PLAYER_ID,
        username: 'player-one',
        state: PresenceState.ONLINE,
        primaryRoomId: ORPHANED_ROOM_ID,
        privateRoomId: null,
        lastSeenAt: Date.now(),
      },
    ])

    const app = buildApp()
    const res = await request(app)
      .delete(`/api/rooms/${GROUP_ROOM_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID })

    expect(res.status).toBe(200)

    const wsCalls = app.locals.wsManager.broadcastEventToSession.mock.calls as Array<[string, any]>
    const reconcileJoined = wsCalls.find(([, event]) => {
      return (
        event.type === 'ROOM:USER_JOINED' && event.payload?.reason === 'ROOM_FAILBACK_RECONCILE'
      )
    })

    expect(reconcileJoined).toBeTruthy()
    expect(reconcileJoined?.[1]?.payload?.roomId).toBe(MAIN_ROOM_ID)
  })

  it('emits ROOM:USER_LEFT and ROOM:USER_JOINED before ROOM:DELETED during group delete', async () => {
    mocks.getRoom.mockResolvedValue({
      id: GROUP_ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Scout Team',
      type: RoomType.GROUP,
    })

    mocks.getRoomMemberIds.mockResolvedValue([PLAYER_ID])

    const app = buildApp()
    const res = await request(app)
      .delete(`/api/rooms/${GROUP_ROOM_ID}`)
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID })

    expect(res.status).toBe(200)

    const wsCalls = app.locals.wsManager.broadcastEventToSession.mock.calls as Array<[string, any]>
    const roomClosedCalls = wsCalls.filter(([, event]) => event.payload?.reason === 'ROOM_CLOSED')

    expect(roomClosedCalls.length).toBeGreaterThanOrEqual(2)

    const leftIndex = wsCalls.findIndex(
      ([, event]) => event.type === 'ROOM:USER_LEFT' && event.payload?.reason === 'ROOM_CLOSED'
    )
    const joinedIndex = wsCalls.findIndex(
      ([, event]) => event.type === 'ROOM:USER_JOINED' && event.payload?.reason === 'ROOM_CLOSED'
    )
    const deletedIndex = wsCalls.findIndex(([, event]) => event.type === 'ROOM:DELETED')

    expect(leftIndex).toBeGreaterThanOrEqual(0)
    expect(joinedIndex).toBeGreaterThanOrEqual(0)
    expect(deletedIndex).toBeGreaterThanOrEqual(0)

    expect(leftIndex).toBeLessThan(deletedIndex)
    expect(joinedIndex).toBeLessThan(deletedIndex)

    const deletedEvent = wsCalls[deletedIndex]?.[1]
    expect(deletedEvent.payload?.movedUserIds).toContain(PLAYER_ID)
    expect(deletedEvent.payload?.movedToRoomId).toBe(MAIN_ROOM_ID)
  })

  it('uses MAIN fallback path for whisper end movement and emits joined event to MAIN', async () => {
    mocks.getRoom.mockResolvedValue({
      id: PRIVATE_ROOM_ID,
      sessionId: SESSION_ID,
      name: 'Whisper',
      type: RoomType.PRIVATE,
    })

    const app = buildApp()
    const res = await request(app)
      .post(`/api/rooms/${PRIVATE_ROOM_ID}/end-whisper`)
      .set('Authorization', 'Bearer token')
      .send({ sessionId: SESSION_ID })

    expect(res.status).toBe(200)
    expect(mocks.endWhisperBubbleForSession).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      whisperRoomId: PRIVATE_ROOM_ID,
      fallbackRoomId: MAIN_ROOM_ID,
    })

    const wsCalls = app.locals.wsManager.broadcastEventToSession.mock.calls as Array<[string, any]>
    const whisperJoin = wsCalls.find(([, event]) => {
      return event.type === 'ROOM:USER_JOINED' && event.payload?.reason === 'WHISPER_ENDED'
    })

    expect(whisperJoin).toBeTruthy()
    expect(whisperJoin?.[1]?.payload?.roomId).toBe(MAIN_ROOM_ID)
  })
})
