/**
 * Room Slice (Zustand)
 * Manages room state and room member synchronization.
 */

import type { StateCreator } from 'zustand'
import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import type { SessionState } from '@shared'
import type { Room, RoomUser, SessionPresence, SessionTransitionNotice } from '@/types/room'
import type { PresenceSlice } from './presenceSlice'

export type { Room, RoomUser, SessionPresence, SessionTransitionNotice } from '@/types/room'

export interface RoomSlice {
  rooms: Record<UUID, Record<UUID, Room>>
  roomMembers: Record<UUID, RoomUser[]>
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
  handlePresenceGhostModeChanged: (event: EventEnvelope) => void
  handleSessionRoomTransitionApplied: (event: EventEnvelope) => void
}

function upsertMember(list: RoomUser[], member: RoomUser): RoomUser[] {
  return [...list.filter((m) => m.userId !== member.userId), member]
}

function presenceToRoomMember(entry: SessionPresence): RoomUser {
  return {
    userId: entry.userId,
    username: entry.username,
    role: entry.role,
    playerName: entry.playerName,
    avatarUrl: entry.avatarUrl,
    characterName: entry.characterName,
    characterClass: entry.characterClass,
    characterSubclass: entry.characterSubclass,
    characterRace: entry.characterRace,
    level: entry.level,
    characterStats: entry.characterStats,
    presenceState: entry.state,
    ghost: entry.ghost,
    previousGroupId: entry.previousGroupId,
    joinedAt: entry.lastSeenAt,
  }
}

function pruneRoomMembers(state: RoomSlice, roomIdsToRemove: UUID[]): Record<UUID, RoomUser[]> {
  if (roomIdsToRemove.length === 0) {
    return state.roomMembers
  }

  const nextMembers = { ...state.roomMembers }
  for (const roomId of roomIdsToRemove) {
    delete nextMembers[roomId]
  }

  return nextMembers
}

export const createRoomSlice: StateCreator<RoomSlice & PresenceSlice, [], [], RoomSlice> = (
  set,
  get
) => ({
  rooms: {},
  roomMembers: {},
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
      const previousRoomIds = Object.keys(state.rooms[sessionId] || {}) as UUID[]
      const nextBySession = rooms.reduce(
        (acc, room) => {
          acc[room.id] = room
          return acc
        },
        {} as Record<UUID, Room>
      )

      const nextRoomIds = new Set(rooms.map((room) => room.id))
      const removedRoomIds = previousRoomIds.filter((roomId) => !nextRoomIds.has(roomId))

      const nextMembers = pruneRoomMembers(state, removedRoomIds)
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

  replaceSessionPresence: (sessionId, presence) => {
    const nextPresenceByUser = presence.reduce(
      (acc, entry) => {
        acc[entry.userId] = entry
        return acc
      },
      {} as Record<UUID, SessionPresence>
    )

    set((state) => {
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
        nextMembers[roomId] = upsertMember(existing, presenceToRoomMember(entry))
      }

      return {
        roomMembers: nextMembers,
      }
    })

    get().replaceSessionPresenceMap(sessionId, nextPresenceByUser)
  },

  replaceSessionTopology: (sessionId, rooms, presence) => {
    const nextPresenceByUser = presence.reduce(
      (acc, entry) => {
        acc[entry.userId] = entry
        return acc
      },
      {} as Record<UUID, SessionPresence>
    )

    set((state) => {
      const previousRoomIds = Object.keys(state.rooms[sessionId] || {}) as UUID[]
      const nextBySession = rooms.reduce(
        (acc, room) => {
          acc[room.id] = room
          return acc
        },
        {} as Record<UUID, Room>
      )

      const nextRoomIds = new Set(rooms.map((room) => room.id))
      const removedRoomIds = previousRoomIds.filter((roomId) => !nextRoomIds.has(roomId))

      const nextMembers = pruneRoomMembers(state, removedRoomIds)
      for (const room of rooms) {
        nextMembers[room.id] = []
      }

      for (const entry of presence) {
        if (!entry.primaryRoomId) continue
        const roomId = entry.primaryRoomId
        const existing = nextMembers[roomId] || []
        nextMembers[roomId] = upsertMember(existing, presenceToRoomMember(entry))
      }

      return {
        rooms: {
          ...state.rooms,
          [sessionId]: nextBySession,
        },
        roomMembers: nextMembers,
      }
    })

    get().replaceSessionPresenceMap(sessionId, nextPresenceByUser)
  },

  clearSessionTransitionNotice: (sessionId) =>
    set((state) => {
      const nextNotices = { ...state.sessionTransitionNotice }
      delete nextNotices[sessionId]
      return { sessionTransitionNotice: nextNotices }
    }),

  clearRooms: (sessionId) => {
    if (!sessionId) {
      set(() => ({
        rooms: {},
        roomMembers: {},
        sessionTransitionNotice: {},
      }))

      get().clearSessionPresence()
      return
    }

    set((state) => {
      const nextRooms = { ...state.rooms }
      const sessionRoomIds = Object.keys(nextRooms[sessionId] || {}) as UUID[]
      delete nextRooms[sessionId]

      const nextMembers = { ...state.roomMembers }
      for (const roomId of sessionRoomIds) {
        delete nextMembers[roomId]
      }

      const nextNotices = { ...state.sessionTransitionNotice }
      delete nextNotices[sessionId]

      return {
        rooms: nextRooms,
        roomMembers: nextMembers,
        sessionTransitionNotice: nextNotices,
      }
    })

    get().clearSessionPresence(sessionId)
  },

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
      playerName?: string
      avatarUrl?: string
      characterName?: string
      characterClass?: string
      characterSubclass?: string | null
      characterRace?: string
      level?: number
      characterStats?: Record<string, unknown> | null
    }

    const joinedAt = payload.joinedAt || event.timestamp
    const existingPresence = get().sessionPresence[event.sessionId]?.[payload.userId]
    const nextMember: RoomUser = {
      userId: payload.userId,
      username: payload.username,
      role: existingPresence?.role,
      playerName: payload.playerName ?? existingPresence?.playerName,
      avatarUrl: payload.avatarUrl ?? existingPresence?.avatarUrl,
      characterName: payload.characterName ?? existingPresence?.characterName,
      characterClass: payload.characterClass ?? existingPresence?.characterClass,
      characterSubclass: payload.characterSubclass ?? existingPresence?.characterSubclass,
      characterRace: payload.characterRace ?? existingPresence?.characterRace,
      level: payload.level ?? existingPresence?.level,
      characterStats: payload.characterStats ?? existingPresence?.characterStats,
      presenceState: PresenceState.ONLINE,
      ghost: existingPresence?.ghost,
      previousGroupId: existingPresence?.previousGroupId,
      joinedAt,
    }

    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [payload.roomId]: upsertMember(state.roomMembers[payload.roomId] || [], nextMember),
      },
    }))

    get().upsertSessionPresenceOnJoin({
      sessionId: event.sessionId,
      userId: payload.userId,
      username: payload.username,
      roomId: payload.roomId,
      joinedAt,
      playerName: payload.playerName,
      avatarUrl: payload.avatarUrl,
      characterName: payload.characterName,
      characterClass: payload.characterClass,
      characterSubclass: payload.characterSubclass,
      characterRace: payload.characterRace,
      level: payload.level,
      characterStats: payload.characterStats,
    })
  },

  handleUserLeft: (event) => {
    const payload = event.payload as {
      roomId: UUID
      userId: UUID
      leftAt?: number
    }

    const leftAt = payload.leftAt || event.timestamp

    set((state) => ({
      roomMembers: {
        ...state.roomMembers,
        [payload.roomId]: (state.roomMembers[payload.roomId] || []).filter(
          (m) => m.userId !== payload.userId
        ),
      },
    }))

    get().markSessionPresenceOnLeft({
      sessionId: event.sessionId,
      userId: payload.userId,
      leftAt,
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
      previousGroupId?: UUID | null
    }

    const nextPresence = payload.newState || payload.presence || PresenceState.IDLE
    const changedAt = payload.changedAt || event.timestamp
    const existingPresence = get().sessionPresence[event.sessionId]?.[payload.userId]
    const previousRoomId = existingPresence?.primaryRoomId
    const roomId = payload.roomId || previousRoomId

    set((state) => {
      const nextRoomMembers = { ...state.roomMembers }
      if (previousRoomId && previousRoomId !== roomId) {
        nextRoomMembers[previousRoomId] = (state.roomMembers[previousRoomId] || []).filter(
          (member) => member.userId !== payload.userId
        )
      }

      if (roomId) {
        const existingMember = (state.roomMembers[roomId] || []).find(
          (member) => member.userId === payload.userId
        )
        const nextMember: RoomUser = {
          userId: payload.userId,
          username:
            payload.username || existingMember?.username || existingPresence?.username || '',
          role: existingMember?.role ?? existingPresence?.role,
          playerName: existingMember?.playerName ?? existingPresence?.playerName,
          avatarUrl: existingMember?.avatarUrl ?? existingPresence?.avatarUrl,
          characterName: existingMember?.characterName ?? existingPresence?.characterName,
          characterClass: existingMember?.characterClass ?? existingPresence?.characterClass,
          characterSubclass:
            existingMember?.characterSubclass ?? existingPresence?.characterSubclass,
          characterRace: existingMember?.characterRace ?? existingPresence?.characterRace,
          level: existingMember?.level ?? existingPresence?.level,
          characterStats: existingMember?.characterStats ?? existingPresence?.characterStats,
          presenceState: nextPresence,
          ghost: existingMember?.ghost ?? existingPresence?.ghost,
          previousGroupId: payload.previousGroupId || existingPresence?.previousGroupId,
          joinedAt: existingMember?.joinedAt || changedAt,
        }
        nextRoomMembers[roomId] = upsertMember(nextRoomMembers[roomId] || [], nextMember)
      }

      return {
        roomMembers: nextRoomMembers,
      }
    })

    get().applySessionPresenceStateChange({
      sessionId: event.sessionId,
      userId: payload.userId,
      username: payload.username,
      roomId: roomId || undefined,
      state: nextPresence,
      changedAt,
      previousGroupId: payload.previousGroupId || undefined,
    })
  },

  handlePresenceGhostModeChanged: (event) => {
    const payload = event.payload as {
      userId: UUID
      username?: string
      roomId?: UUID | null
      ghostMode?: boolean
      changedAt?: number
      previousGroupId?: UUID | null
    }

    const changedAt = payload.changedAt || event.timestamp
    const existingPresence = get().sessionPresence[event.sessionId]?.[payload.userId]
    const roomId = payload.roomId || existingPresence?.primaryRoomId

    get().applySessionPresenceStateChange({
      sessionId: event.sessionId,
      userId: payload.userId,
      username: payload.username,
      roomId: roomId || undefined,
      state: existingPresence?.state || PresenceState.IDLE,
      changedAt,
      ghost: payload.ghostMode || false,
      previousGroupId: payload.previousGroupId || existingPresence?.previousGroupId,
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

    const presenceBySession = get().sessionPresence[event.sessionId] || {}

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
          const existingPresence = presenceBySession[user.userId]

          return {
            userId: user.userId,
            username: user.username,
            role: existingPresence?.role,
            playerName: existingPresence?.playerName,
            avatarUrl: existingPresence?.avatarUrl,
            characterName: existingPresence?.characterName,
            characterClass: existingPresence?.characterClass,
            characterSubclass: existingPresence?.characterSubclass,
            characterRace: existingPresence?.characterRace,
            level: existingPresence?.level,
            characterStats: existingPresence?.characterStats,
            presenceState: payload.targetState,
            ghost: existingPresence?.ghost,
            previousGroupId: existingPresence?.previousGroupId,
            joinedAt: event.timestamp,
          }
        }),
      ]

      return {
        rooms: {
          ...state.rooms,
          [event.sessionId]: upsertedRooms,
        },
        roomMembers: nextMembers,
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

    get().applySessionRoomTransitionPresence({
      sessionId: event.sessionId,
      users: payload.users,
      targetRoomId: payload.targetRoomId,
      targetState: payload.targetState,
      changedAt: event.timestamp,
    })
  },
})
