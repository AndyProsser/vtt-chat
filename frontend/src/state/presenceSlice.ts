import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import type { SessionPresence } from '@/types/room'
import type { StateCreator } from 'zustand'

export interface PresenceSlice {
  sessionPresence: Record<UUID, Record<UUID, SessionPresence>>

  replaceSessionPresenceMap: (
    sessionId: UUID,
    presenceByUser: Record<UUID, SessionPresence>
  ) => void
  clearSessionPresence: (sessionId?: UUID) => void
  upsertSessionPresenceOnJoin: (params: {
    sessionId: UUID
    userId: UUID
    username: string
    roomId: UUID
    joinedAt: number
  }) => void
  markSessionPresenceOnLeft: (params: { sessionId: UUID; userId: UUID; leftAt: number }) => void
  applySessionPresenceStateChange: (params: {
    sessionId: UUID
    userId: UUID
    username?: string
    roomId?: UUID
    state: PresenceState
    changedAt: number
  }) => void
  applySessionRoomTransitionPresence: (params: {
    sessionId: UUID
    users: Array<{ userId: UUID; username: string }>
    targetRoomId: UUID
    targetState: PresenceState
    changedAt: number
  }) => void
}

export const createPresenceSlice: StateCreator<PresenceSlice> = (set) => ({
  sessionPresence: {},

  replaceSessionPresenceMap: (sessionId, presenceByUser) =>
    set((state) => ({
      sessionPresence: {
        ...state.sessionPresence,
        [sessionId]: presenceByUser,
      },
    })),

  clearSessionPresence: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return { sessionPresence: {} }
      }

      const nextPresence = { ...state.sessionPresence }
      delete nextPresence[sessionId]
      return { sessionPresence: nextPresence }
    }),

  upsertSessionPresenceOnJoin: ({ sessionId, userId, username, roomId, joinedAt }) =>
    set((state) => {
      const existingPresence = state.sessionPresence[sessionId]?.[userId]

      return {
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: {
            ...(state.sessionPresence[sessionId] || {}),
            [userId]: {
              ...existingPresence,
              userId,
              username,
              state: PresenceState.ONLINE,
              primaryRoomId: roomId,
              lastSeenAt: joinedAt,
            },
          },
        },
      }
    }),

  markSessionPresenceOnLeft: ({ sessionId, userId, leftAt }) =>
    set((state) => {
      const sessionPresence = state.sessionPresence[sessionId] || {}
      const existing = sessionPresence[userId]

      return {
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: {
            ...sessionPresence,
            [userId]: existing
              ? {
                  ...existing,
                  state: PresenceState.IDLE,
                  primaryRoomId: undefined,
                  lastSeenAt: leftAt,
                }
              : {
                  userId,
                  username: '',
                  state: PresenceState.IDLE,
                  lastSeenAt: leftAt,
                },
          },
        },
      }
    }),

  applySessionPresenceStateChange: ({ sessionId, userId, username, roomId, state, changedAt }) =>
    set((currentState) => {
      const bySession = currentState.sessionPresence[sessionId] || {}
      const existing = bySession[userId]
      const resolvedRoomId = roomId || existing?.primaryRoomId

      return {
        sessionPresence: {
          ...currentState.sessionPresence,
          [sessionId]: {
            ...bySession,
            [userId]: {
              ...existing,
              userId,
              username: username || existing?.username || '',
              state,
              primaryRoomId: resolvedRoomId,
              privateRoomId: existing?.privateRoomId,
              lastSeenAt: changedAt,
            },
          },
        },
      }
    }),

  applySessionRoomTransitionPresence: ({
    sessionId,
    users,
    targetRoomId,
    targetState,
    changedAt,
  }) =>
    set((state) => {
      const nextPresenceBySession = {
        ...(state.sessionPresence[sessionId] || {}),
      } as Record<UUID, SessionPresence>

      for (const user of users) {
        const existingPresence = nextPresenceBySession[user.userId]
        nextPresenceBySession[user.userId] = {
          ...existingPresence,
          userId: user.userId,
          username: user.username,
          state: targetState,
          primaryRoomId: targetRoomId,
          lastSeenAt: changedAt,
        }
      }

      return {
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: nextPresenceBySession,
        },
      }
    }),
})
