/**
 * Room Slice (Zustand)
 * Manages room state (creation, membership, presence).
 * Reference: docs/architecture/ARCHITECTURE.md
 */

import type { StateCreator } from 'zustand'
import type { UUID, PresenceState } from '@shared'
import type { EventEnvelope } from '@shared'

export interface Room {
  id: UUID
  sessionId: UUID
  name: string
  description?: string
  createdAt: number
  createdBy: UUID
}

export interface RoomUser {
  userId: UUID
  username: string
  presenceState: PresenceState
  joinedAt: number
}

export interface RoomSlice {
  // State
  rooms: Record<UUID, Room> // keyed by sessionId, then roomId
  roomMembers: Record<UUID, RoomUser[]> // keyed by roomId
  isLoading: boolean

  // Actions
  createRoom: (sessionId: UUID, room: Room) => void
  deleteRoom: (sessionId: UUID, roomId: UUID) => void
  addRoomMember: (roomId: UUID, member: RoomUser) => void
  removeRoomMember: (roomId: UUID, userId: UUID) => void
  updateMemberPresence: (roomId: UUID, userId: UUID, presence: PresenceState) => void
  clearRooms: (sessionId?: UUID) => void

  // Event handlers
  handleRoomCreated: (event: EventEnvelope) => void
  handleUserJoined: (event: EventEnvelope) => void
  handleUserLeft: (event: EventEnvelope) => void
  handlePresenceStateChanged: (event: EventEnvelope) => void
}

export const createRoomSlice: StateCreator<RoomSlice> = (set) => ({
  // State
  rooms: {},
  roomMembers: {},
  isLoading: false,

  // Actions
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
        [room.id]: [],
      },
    })),

  deleteRoom: (sessionId, roomId) =>
    set((state) => {
      const sessionRooms = { ...state.rooms[sessionId] }
      delete sessionRooms[roomId]

      const newRoomMembers = { ...state.roomMembers }
      delete newRoomMembers[roomId]

      return {
        rooms: {
          ...state.rooms,
          [sessionId]: sessionRooms,
        },
        roomMembers: newRoomMembers,
      }
    }),

  addRoomMember: (roomId, member) =>
    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [roomId]: [...(state.roomMembers[roomId] || []), member],
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

  clearRooms: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return { rooms: {}, roomMembers: {} }
      }

      const newRooms = { ...state.rooms }
      const roomIds = Object.keys(newRooms[sessionId] || {})
      roomIds.forEach((roomId) => {
        delete newRooms[sessionId][roomId]
      })

      const newRoomMembers = { ...state.roomMembers }
      roomIds.forEach((roomId) => {
        delete newRoomMembers[roomId]
      })

      return {
        rooms: newRooms,
        roomMembers: newRoomMembers,
      }
    }),

  // Event handlers
  handleRoomCreated: (event) => {
    const payload = event.payload as {
      roomId: UUID
      name: string
      description?: string
      createdBy: UUID
    }

    const room: Room = {
      id: payload.roomId,
      sessionId: event.sessionId,
      name: payload.name,
      description: payload.description,
      createdAt: event.timestamp,
      createdBy: payload.createdBy,
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
        [room.id]: [],
      },
    }))
  },

  handleUserJoined: (event) => {
    const payload = event.payload as {
      roomId: UUID
      userId: UUID
      username: string
    }

    const member: RoomUser = {
      userId: payload.userId,
      username: payload.username,
      presenceState: 'PRESENT',
      joinedAt: event.timestamp,
    }

    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [payload.roomId]: [
          ...(state.roomMembers[payload.roomId] || []).filter((m) => m.userId !== payload.userId),
          member,
        ],
      },
    }))
  },

  handleUserLeft: (event) => {
    const payload = event.payload as {
      roomId: UUID
      userId: UUID
    }

    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [payload.roomId]: (state.roomMembers[payload.roomId] || []).filter(
          (m) => m.userId !== payload.userId
        ),
      },
    }))
  },

  handlePresenceStateChanged: (event) => {
    const payload = event.payload as {
      roomId: UUID
      userId: UUID
      presence: PresenceState
    }

    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [payload.roomId]: (state.roomMembers[payload.roomId] || []).map((m) =>
          m.userId === payload.userId ? { ...m, presenceState: payload.presence } : m
        ),
      },
    }))
  },
})
