import type { UUID } from '@shared'
import { PresenceState } from '@shared'
import type { EventEnvelope } from '@shared'
import type { SessionPresence } from '@/types/room'
import type { StateCreator } from 'zustand'

export interface SessionStatsSnapshot {
  connectedPlayersWithDm: number
  connectedPlayers: number
  connectedSpectators: number
  connectedTotal: number
  updatedAt: number
}

export interface PresenceSlice {
  sessionPresence: Record<UUID, Record<UUID, SessionPresence>>
  sessionStatsBySessionId: Record<UUID, SessionStatsSnapshot>

  replaceSessionPresenceMap: (
    sessionId: UUID,
    presenceByUser: Record<UUID, SessionPresence>
  ) => void
  replaceSessionStatsSnapshot: (sessionId: UUID, snapshot: SessionStatsSnapshot) => void
  handleSessionStatsUpdated: (event: EventEnvelope) => void
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
    ghost?: boolean
    previousGroupId?: UUID
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
  sessionStatsBySessionId: {},

  replaceSessionPresenceMap: (sessionId, presenceByUser) =>
    set((state) => ({
      sessionPresence: {
        ...state.sessionPresence,
        [sessionId]: presenceByUser,
      },
    })),

  replaceSessionStatsSnapshot: (sessionId, snapshot) =>
    set((state) => ({
      sessionStatsBySessionId: {
        ...state.sessionStatsBySessionId,
        [sessionId]: snapshot,
      },
    })),

  handleSessionStatsUpdated: (event) => {
    const payload = event.payload as SessionStatsSnapshot
    if (!payload) {
      return
    }

    set((state) => ({
      sessionStatsBySessionId: {
        ...state.sessionStatsBySessionId,
        [event.sessionId]: {
          connectedPlayersWithDm: Math.max(0, payload.connectedPlayersWithDm || 0),
          connectedPlayers: Math.max(0, payload.connectedPlayers || 0),
          connectedSpectators: Math.max(0, payload.connectedSpectators || 0),
          connectedTotal: Math.max(0, payload.connectedTotal || 0),
          updatedAt: payload.updatedAt || event.timestamp,
        },
      },
    }))
  },

  clearSessionPresence: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return { sessionPresence: {}, sessionStatsBySessionId: {} }
      }

      const nextPresence = { ...state.sessionPresence }
      const nextStats = { ...state.sessionStatsBySessionId }
      delete nextPresence[sessionId]
      delete nextStats[sessionId]
      return { sessionPresence: nextPresence, sessionStatsBySessionId: nextStats }
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

  applySessionPresenceStateChange: ({
    sessionId,
    userId,
    username,
    roomId,
    state,
    changedAt,
    ghost,
    previousGroupId,
  }) =>
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
              ghost: ghost !== undefined ? ghost : existing?.ghost || false,
              primaryRoomId: resolvedRoomId,
              previousGroupId:
                previousGroupId !== undefined ? previousGroupId : existing?.previousGroupId,
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
          previousGroupId: existingPresence?.previousGroupId,
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
