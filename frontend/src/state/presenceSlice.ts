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
  applySessionPresenceDeviceSessions: (params: {
    sessionId: UUID
    userId: UUID
    deviceSessions: NonNullable<SessionPresence['deviceSessions']>
  }) => void
  clearSessionPresence: (sessionId?: UUID) => void
  upsertSessionPresenceOnJoin: (params: {
    sessionId: UUID
    userId: UUID
    username: string
    roomId: UUID
    joinedAt: number
    playerName?: string
    avatarUrl?: string
    characterName?: string
    characterClass?: string
    characterSubclass?: string | null
    characterRace?: string
    level?: number
    characterStats?: Record<string, unknown> | null
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
    playerName?: string | null
    avatarUrl?: string | null
    characterName?: string | null
    characterClass?: string | null
    characterSubclass?: string | null
    characterRace?: string | null
    level?: number | null
    characterStats?: Record<string, unknown> | null
  }) => void
  applySessionPresenceProfileUpdate: (params: {
    sessionId: UUID
    userId: UUID
    username?: string
    updatedAt: number
    roomId?: UUID
    previousGroupId?: UUID
    playerName?: string | null
    avatarUrl?: string | null
    characterName?: string | null
    characterClass?: string | null
    characterSubclass?: string | null
    characterRace?: string | null
    level?: number | null
    characterStats?: Record<string, unknown> | null
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

  applySessionPresenceDeviceSessions: ({ sessionId, userId, deviceSessions }) =>
    set((state) => {
      const bySession = state.sessionPresence[sessionId] || {}
      const existing = bySession[userId]

      if (!existing) {
        return state
      }

      return {
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: {
            ...bySession,
            [userId]: {
              ...existing,
              deviceSessions,
            },
          },
        },
      }
    }),

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

  upsertSessionPresenceOnJoin: ({
    sessionId,
    userId,
    username,
    roomId,
    joinedAt,
    playerName,
    avatarUrl,
    characterName,
    characterClass,
    characterSubclass,
    characterRace,
    level,
    characterStats,
  }) =>
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
              playerName: playerName ?? existingPresence?.playerName,
              avatarUrl: avatarUrl ?? existingPresence?.avatarUrl,
              characterName: characterName ?? existingPresence?.characterName,
              characterClass: characterClass ?? existingPresence?.characterClass,
              characterSubclass: characterSubclass ?? existingPresence?.characterSubclass,
              characterRace: characterRace ?? existingPresence?.characterRace,
              level: level ?? existingPresence?.level,
              characterStats: characterStats ?? existingPresence?.characterStats,
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
    playerName,
    avatarUrl,
    characterName,
    characterClass,
    characterSubclass,
    characterRace,
    level,
    characterStats,
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
              playerName:
                playerName !== undefined ? (playerName ?? undefined) : existing?.playerName,
              avatarUrl: avatarUrl !== undefined ? (avatarUrl ?? undefined) : existing?.avatarUrl,
              characterName:
                characterName !== undefined
                  ? (characterName ?? undefined)
                  : existing?.characterName,
              characterClass:
                characterClass !== undefined
                  ? (characterClass ?? undefined)
                  : existing?.characterClass,
              characterSubclass:
                characterSubclass !== undefined
                  ? (characterSubclass ?? undefined)
                  : existing?.characterSubclass,
              characterRace:
                characterRace !== undefined
                  ? (characterRace ?? undefined)
                  : existing?.characterRace,
              level: level !== undefined ? (level ?? undefined) : existing?.level,
              characterStats:
                characterStats !== undefined
                  ? (characterStats ?? undefined)
                  : existing?.characterStats,
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

  applySessionPresenceProfileUpdate: ({
    sessionId,
    userId,
    username,
    updatedAt,
    roomId,
    previousGroupId,
    playerName,
    avatarUrl,
    characterName,
    characterClass,
    characterSubclass,
    characterRace,
    level,
    characterStats,
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
              playerName:
                playerName !== undefined ? (playerName ?? undefined) : existing?.playerName,
              avatarUrl: avatarUrl !== undefined ? (avatarUrl ?? undefined) : existing?.avatarUrl,
              characterName:
                characterName !== undefined
                  ? (characterName ?? undefined)
                  : existing?.characterName,
              characterClass:
                characterClass !== undefined
                  ? (characterClass ?? undefined)
                  : existing?.characterClass,
              characterSubclass:
                characterSubclass !== undefined
                  ? (characterSubclass ?? undefined)
                  : existing?.characterSubclass,
              characterRace:
                characterRace !== undefined
                  ? (characterRace ?? undefined)
                  : existing?.characterRace,
              level: level !== undefined ? (level ?? undefined) : existing?.level,
              characterStats:
                characterStats !== undefined
                  ? (characterStats ?? undefined)
                  : existing?.characterStats,
              primaryRoomId: resolvedRoomId,
              previousGroupId:
                previousGroupId !== undefined ? previousGroupId : existing?.previousGroupId,
              lastSeenAt: updatedAt,
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
