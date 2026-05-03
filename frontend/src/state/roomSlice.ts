/**
 * Room Slice (Zustand)
 * Manages room state and presence synchronization.
 */

import type { StateCreator } from 'zustand'
import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import type { SessionState } from '@shared'
import type { Room, RoomUser, SessionPresence, SessionTransitionNotice } from '@/types/room'

export type { Room, RoomUser, SessionPresence, SessionTransitionNotice } from '@/types/room'

export interface RoomSlice {
  rooms: Record<UUID, Record<UUID, Room>>
  roomMembers: Record<UUID, RoomUser[]>
  sessionPresence: Record<UUID, Record<UUID, SessionPresence>>
  sessionTransitionNotice: Record<UUID, SessionTransitionNotice>
  isLoading: boolean

  createRoom: (sessionId: UUID, room: Room) => void
  deleteRoom: (sessionId: UUID, roomId: UUID) => void
  addRoomMember: (roomId: UUID, member: RoomUser) => void
  removeRoomMember: (roomId: UUID, userId: UUID) => void
  updateMemberPresence: (roomId: UUID, userId: UUID, presence: PresenceState) => void
  replaceSessionRooms: (sessionId: UUID, rooms: Room[]) => void
  replaceSessionPresence: (sessionId: UUID, presence: SessionPresence[]) => void
  replaceSessionTopology: (sessionId: UUID, rooms: Room[], presence: SessionPresence[]) => void
  clearSessionTransitionNotice: (sessionId: UUID) => void
  clearRooms: (sessionId?: UUID) => void

  handleRoomCreated: (event: EventEnvelope) => void
  handleUserJoined: (event: EventEnvelope) => void
  handleUserLeft: (event: EventEnvelope) => void
  handlePresenceStateChanged: (event: EventEnvelope) => void
  handleSessionRoomTransitionApplied: (event: EventEnvelope) => void
}

function upsertMember(list: RoomUser[], member: RoomUser): RoomUser[] {
  return [...list.filter((m) => m.userId !== member.userId), member]
}

export const createRoomSlice: StateCreator<RoomSlice> = (set) => ({
  rooms: {},
  roomMembers: {},
  sessionPresence: {},
  sessionTransitionNotice: {},
  isLoading: false,

  createRoom: (sessionId, room) =>
    set((state) => ({
      rooms: {
        ...state.rooms,
        [sessionId]: {
          ...(state.rooms[sessionId] || {}),
          [room.id]: room,
        },
      },
      roomMembers: {
        ...state.roomMembers,
        [room.id]: state.roomMembers[room.id] || [],
      },
    })),

  deleteRoom: (sessionId, roomId) =>
    set((state) => {
      const sessionRooms = { ...(state.rooms[sessionId] || {}) }
      delete sessionRooms[roomId]

      const nextMembers = { ...state.roomMembers }
      delete nextMembers[roomId]

      return {
        rooms: {
          ...state.rooms,
          [sessionId]: sessionRooms,
        },
        roomMembers: nextMembers,
      }
    }),

  addRoomMember: (roomId, member) =>
    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [roomId]: upsertMember(state.roomMembers[roomId] || [], member),
      },
    })),

  removeRoomMember: (roomId, userId) =>
    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [roomId]: (state.roomMembers[roomId] || []).filter((m) => m.userId !== userId),
      },
    })),

  updateMemberPresence: (roomId, userId, presence) =>
    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [roomId]: (state.roomMembers[roomId] || []).map((m) =>
          m.userId === userId ? { ...m, presenceState: presence } : m
        ),
      },
    })),

  replaceSessionRooms: (sessionId, rooms) =>
    set((state) => {
      const nextBySession = rooms.reduce(
        (acc, room) => {
          acc[room.id] = room
          return acc
        },
        {} as Record<UUID, Room>
      )

      const nextMembers = { ...state.roomMembers }
      for (const room of rooms) {
        nextMembers[room.id] = nextMembers[room.id] || []
      }

      return {
        rooms: {
          ...state.rooms,
          [sessionId]: nextBySession,
        },
        roomMembers: nextMembers,
      }
    }),

  replaceSessionPresence: (sessionId, presence) =>
    set((state) => {
      const nextPresenceByUser = presence.reduce(
        (acc, entry) => {
          acc[entry.userId] = entry
          return acc
        },
        {} as Record<UUID, SessionPresence>
      )

      const sessionRooms = state.rooms[sessionId] || {}
      const roomIds = Object.keys(sessionRooms) as UUID[]
      const nextMembers = { ...state.roomMembers }

      for (const roomId of roomIds) {
        nextMembers[roomId] = []
      }

      for (const entry of presence) {
        if (!entry.primaryRoomId) continue
        const roomId = entry.primaryRoomId
        const existing = nextMembers[roomId] || []
        nextMembers[roomId] = upsertMember(existing, {
          userId: entry.userId,
          username: entry.username,
          playerName: entry.playerName,
          avatarUrl: entry.avatarUrl,
          characterName: entry.characterName,
          characterClass: entry.characterClass,
          characterSubclass: entry.characterSubclass,
          characterRace: entry.characterRace,
          level: entry.level,
          characterStats: entry.characterStats,
          presenceState: entry.state,
          joinedAt: entry.lastSeenAt,
        })
      }

      return {
        roomMembers: nextMembers,
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: nextPresenceByUser,
        },
      }
    }),

  replaceSessionTopology: (sessionId, rooms, presence) =>
    set((state) => {
      const nextBySession = rooms.reduce(
        (acc, room) => {
          acc[room.id] = room
          return acc
        },
        {} as Record<UUID, Room>
      )

      const nextPresenceByUser = presence.reduce(
        (acc, entry) => {
          acc[entry.userId] = entry
          return acc
        },
        {} as Record<UUID, SessionPresence>
      )

      const nextMembers = { ...state.roomMembers }
      for (const room of rooms) {
        nextMembers[room.id] = []
      }

      for (const entry of presence) {
        if (!entry.primaryRoomId) continue
        const roomId = entry.primaryRoomId
        const existing = nextMembers[roomId] || []
        nextMembers[roomId] = upsertMember(existing, {
          userId: entry.userId,
          username: entry.username,
          playerName: entry.playerName,
          avatarUrl: entry.avatarUrl,
          characterName: entry.characterName,
          characterClass: entry.characterClass,
          characterSubclass: entry.characterSubclass,
          characterRace: entry.characterRace,
          level: entry.level,
          characterStats: entry.characterStats,
          presenceState: entry.state,
          joinedAt: entry.lastSeenAt,
        })
      }

      return {
        rooms: {
          ...state.rooms,
          [sessionId]: nextBySession,
        },
        roomMembers: nextMembers,
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: nextPresenceByUser,
        },
      }
    }),

  clearSessionTransitionNotice: (sessionId) =>
    set((state) => {
      const nextNotices = { ...state.sessionTransitionNotice }
      delete nextNotices[sessionId]
      return { sessionTransitionNotice: nextNotices }
    }),

  clearRooms: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return {
          rooms: {},
          roomMembers: {},
          sessionPresence: {},
          sessionTransitionNotice: {},
        }
      }

      const nextRooms = { ...state.rooms }
      const sessionRoomIds = Object.keys(nextRooms[sessionId] || {}) as UUID[]
      delete nextRooms[sessionId]

      const nextMembers = { ...state.roomMembers }
      for (const roomId of sessionRoomIds) {
        delete nextMembers[roomId]
      }

      const nextPresence = { ...state.sessionPresence }
      delete nextPresence[sessionId]

      const nextNotices = { ...state.sessionTransitionNotice }
      delete nextNotices[sessionId]

      return {
        rooms: nextRooms,
        roomMembers: nextMembers,
        sessionPresence: nextPresence,
        sessionTransitionNotice: nextNotices,
      }
    }),

  handleRoomCreated: (event) => {
    const payload = event.payload as {
      roomId: UUID
      name?: string
      roomName?: string
      roomType?: RoomType
      createdBy?: UUID
      createdAt?: number
    }

    const room: Room = {
      id: payload.roomId,
      sessionId: event.sessionId,
      name: payload.name || payload.roomName || 'Room',
      type: payload.roomType || RoomType.GROUP,
      createdAt: payload.createdAt || event.timestamp,
      createdBy: payload.createdBy || event.userId,
    }

    set((state) => ({
      rooms: {
        ...state.rooms,
        [event.sessionId]: {
          ...(state.rooms[event.sessionId] || {}),
          [room.id]: room,
        },
      },
      roomMembers: {
        ...state.roomMembers,
        [room.id]: state.roomMembers[room.id] || [],
      },
    }))
  },

  handleUserJoined: (event) => {
    const payload = event.payload as {
      roomId: UUID
      userId: UUID
      username: string
      joinedAt?: number
    }

    set((state) => {
      const existingPresence = state.sessionPresence[event.sessionId]?.[payload.userId]
      const nextMember: RoomUser = {
        userId: payload.userId,
        username: payload.username,
        playerName: existingPresence?.playerName,
        avatarUrl: existingPresence?.avatarUrl,
        characterName: existingPresence?.characterName,
        characterClass: existingPresence?.characterClass,
        characterSubclass: existingPresence?.characterSubclass,
        characterRace: existingPresence?.characterRace,
        level: existingPresence?.level,
        characterStats: existingPresence?.characterStats,
        presenceState: PresenceState.ONLINE,
        joinedAt: payload.joinedAt || event.timestamp,
      }

      return {
        roomMembers: {
          ...state.roomMembers,
          [payload.roomId]: upsertMember(state.roomMembers[payload.roomId] || [], nextMember),
        },
        sessionPresence: {
          ...state.sessionPresence,
          [event.sessionId]: {
            ...(state.sessionPresence[event.sessionId] || {}),
            [payload.userId]: {
              ...existingPresence,
              userId: payload.userId,
              username: payload.username,
              state: PresenceState.ONLINE,
              primaryRoomId: payload.roomId,
              lastSeenAt: payload.joinedAt || event.timestamp,
            },
          },
        },
      }
    })
  },

  handleUserLeft: (event) => {
    const payload = event.payload as {
      roomId: UUID
      userId: UUID
      leftAt?: number
    }

    set((state) => {
      const sessionPresence = state.sessionPresence[event.sessionId] || {}
      const existing = sessionPresence[payload.userId]

      return {
        roomMembers: {
          ...state.roomMembers,
          [payload.roomId]: (state.roomMembers[payload.roomId] || []).filter(
            (m) => m.userId !== payload.userId
          ),
        },
        sessionPresence: {
          ...state.sessionPresence,
          [event.sessionId]: {
            ...sessionPresence,
            [payload.userId]: existing
              ? {
                  ...existing,
                  state: PresenceState.IDLE,
                  primaryRoomId: undefined,
                  lastSeenAt: payload.leftAt || event.timestamp,
                }
              : {
                  userId: payload.userId,
                  username: '',
                  state: PresenceState.IDLE,
                  lastSeenAt: payload.leftAt || event.timestamp,
                },
          },
        },
      }
    })
  },

  handlePresenceStateChanged: (event) => {
    const payload = event.payload as {
      roomId?: UUID | null
      userId: UUID
      username?: string
      presence?: PresenceState
      newState?: PresenceState
      changedAt?: number
    }

    const nextPresence = payload.newState || payload.presence || PresenceState.IDLE
    const changedAt = payload.changedAt || event.timestamp

    set((state) => {
      const bySession = state.sessionPresence[event.sessionId] || {}
      const existing = bySession[payload.userId]
      const roomId = payload.roomId || existing?.primaryRoomId

      const nextRoomMembers = { ...state.roomMembers }
      if (roomId) {
        nextRoomMembers[roomId] = (state.roomMembers[roomId] || []).map((member) =>
          member.userId === payload.userId ? { ...member, presenceState: nextPresence } : member
        )
      }

      return {
        roomMembers: nextRoomMembers,
        sessionPresence: {
          ...state.sessionPresence,
          [event.sessionId]: {
            ...bySession,
            [payload.userId]: {
              ...existing,
              userId: payload.userId,
              username: payload.username || existing?.username || '',
              state: nextPresence,
              primaryRoomId: roomId,
              privateRoomId: existing?.privateRoomId,
              lastSeenAt: changedAt,
            },
          },
        },
      }
    })
  },

  handleSessionRoomTransitionApplied: (event) => {
    const payload = event.payload as {
      previousState: SessionState | null
      nextState: SessionState
      movedUsers: number
      targetRoomId: UUID
      targetRoomName: string
      targetState: PresenceState
      mainRoom: { id: UUID; name: string; roomType: RoomType }
      greenRoom: { id: UUID; name: string; roomType: RoomType }
      users: Array<{ userId: UUID; username: string }>
    }

    set((state) => {
      const existingRooms = state.rooms[event.sessionId] || {}
      const upsertedRooms: Record<UUID, Room> = {
        ...existingRooms,
        [payload.mainRoom.id]: {
          id: payload.mainRoom.id,
          sessionId: event.sessionId,
          name: payload.mainRoom.name,
          type: payload.mainRoom.roomType,
          createdAt: event.timestamp,
          createdBy: event.userId,
        },
        [payload.greenRoom.id]: {
          id: payload.greenRoom.id,
          sessionId: event.sessionId,
          name: payload.greenRoom.name,
          type: payload.greenRoom.roomType,
          createdAt: event.timestamp,
          createdBy: event.userId,
        },
      }

      const sessionRoomIds = Object.keys(upsertedRooms) as UUID[]
      const nextMembers = { ...state.roomMembers }

      for (const roomId of sessionRoomIds) {
        nextMembers[roomId] = (nextMembers[roomId] || []).filter(
          (member) => !payload.users.some((user) => user.userId === member.userId)
        )
      }

      nextMembers[payload.targetRoomId] = [
        ...(nextMembers[payload.targetRoomId] || []),
        ...payload.users.map((user) => {
          const existingPresence = state.sessionPresence[event.sessionId]?.[user.userId]

          return {
            userId: user.userId,
            username: user.username,
            playerName: existingPresence?.playerName,
            avatarUrl: existingPresence?.avatarUrl,
            characterName: existingPresence?.characterName,
            characterClass: existingPresence?.characterClass,
            characterSubclass: existingPresence?.characterSubclass,
            characterRace: existingPresence?.characterRace,
            level: existingPresence?.level,
            characterStats: existingPresence?.characterStats,
            presenceState: payload.targetState,
            joinedAt: event.timestamp,
          }
        }),
      ]

      const nextPresenceBySession = {
        ...(state.sessionPresence[event.sessionId] || {}),
      } as Record<UUID, SessionPresence>

      for (const user of payload.users) {
        const existingPresence = nextPresenceBySession[user.userId]
        nextPresenceBySession[user.userId] = {
          ...existingPresence,
          userId: user.userId,
          username: user.username,
          state: payload.targetState,
          primaryRoomId: payload.targetRoomId,
          lastSeenAt: event.timestamp,
        }
      }

      return {
        rooms: {
          ...state.rooms,
          [event.sessionId]: upsertedRooms,
        },
        roomMembers: nextMembers,
        sessionPresence: {
          ...state.sessionPresence,
          [event.sessionId]: nextPresenceBySession,
        },
        sessionTransitionNotice: {
          ...state.sessionTransitionNotice,
          [event.sessionId]: {
            eventId: event.id,
            sessionId: event.sessionId,
            previousState: payload.previousState,
            nextState: payload.nextState,
            movedUsers: payload.movedUsers,
            targetState: payload.targetState,
            targetRoomId: payload.targetRoomId,
            targetRoomName: payload.targetRoomName,
            timestamp: event.timestamp,
          },
        },
      }
    })
  },
})
