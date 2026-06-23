import type { CharacterClassEntry, UUID } from '@shared'
import { PresenceState } from '@shared'
import type { EventEnvelope } from '@shared'
import {
  PRESENCE_OFFLINE_RETENTION_MS,
  PRESENCE_SESSION_MAX_ENTRIES,
  PRESENCE_SESSION_RETAIN_ENTRIES,
  PRESENCE_TRANSIENT_REFRESH_INTERVAL_MS,
  TYPING_INDICATOR_TTL_MS,
  TYPING_RENEW_MIN_EXTENSION_MS,
} from '@/constants/chatPresence.constants'
import type { SessionPresence } from '@/types/room'
import type { TypingIndicator } from '@/types/chat'
import type { StateCreator } from 'zustand'

function pruneTypingIndicators(indicators: TypingIndicator[], now: number): TypingIndicator[] {
  if (indicators.length === 0) return indicators

  let hasExpired = false
  for (let i = 0; i < indicators.length; i += 1) {
    if (indicators[i].until <= now) {
      hasExpired = true
      break
    }
  }

  if (!hasExpired) {
    return indicators
  }

  const next: TypingIndicator[] = []
  for (let i = 0; i < indicators.length; i += 1) {
    if (indicators[i].until > now) {
      next.push(indicators[i])
    }
  }

  return next
}

function pruneSessionPresenceEntries(
  presenceByUser: Record<UUID, SessionPresence>,
  now: number
): Record<UUID, SessionPresence> {
  const entries = Object.entries(presenceByUser) as Array<[UUID, SessionPresence]>
  if (entries.length === 0) {
    return presenceByUser
  }

  // Remove long-expired OFFLINE entries first.
  const retained: Array<[UUID, SessionPresence]> = []
  for (const [userId, presence] of entries) {
    const lastSeenAt = presence.lastSeenAt || 0
    const isOfflineExpired =
      presence.state === PresenceState.OFFLINE && now - lastSeenAt > PRESENCE_OFFLINE_RETENTION_MS

    if (!isOfflineExpired) {
      retained.push([userId, presence])
    }
  }

  if (retained.length <= PRESENCE_SESSION_MAX_ENTRIES && retained.length === entries.length) {
    return presenceByUser
  }

  if (retained.length <= PRESENCE_SESSION_MAX_ENTRIES) {
    return Object.fromEntries(retained) as Record<UUID, SessionPresence>
  }

  // If the map still exceeds bounds, prefer non-offline users and most-recent activity.
  retained.sort((left, right) => {
    const leftOffline = left[1].state === PresenceState.OFFLINE ? 1 : 0
    const rightOffline = right[1].state === PresenceState.OFFLINE ? 1 : 0
    if (leftOffline !== rightOffline) {
      return leftOffline - rightOffline
    }

    return (right[1].lastSeenAt || 0) - (left[1].lastSeenAt || 0)
  })

  return Object.fromEntries(retained.slice(0, PRESENCE_SESSION_RETAIN_ENTRIES)) as Record<
    UUID,
    SessionPresence
  >
}

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
  /**
   * Lightweight WS-presence speaking tracker (individual add/remove).
   * Updated by PRESENCE:STATE_CHANGED SPEAKING/ONLINE transitions without
   * touching sessionPresence or roomMembers, preventing cascade re-renders.
   */
  presenceSpeakingBySession: Record<UUID, Record<UUID, true>>
  /**
   * Lightweight LiveKit speaking tracker (batch replace from activeSpeakers).
   * Separate field so LiveKit batch-replaces never stomp WS-sourced mock speakers.
   */
  presenceLkSpeakingBySession: Record<UUID, Record<UUID, true>>
  /**
   * Transient typing indicators, keyed by sessionId → indicator array.
   * Lightweight alternative to chatSlice.typingIndicators — both sources
   * (CHAT:TYPING_STARTED / CHAT:TYPING_STOPPED) are handled here.
   */
  presenceTypingBySession: Record<UUID, TypingIndicator[]>

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
    characterClasses?: CharacterClassEntry[] | null
    multiclass?: boolean | null
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
    characterClasses?: CharacterClassEntry[] | null
    multiclass?: boolean | null
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
    characterClasses?: CharacterClassEntry[] | null
    multiclass?: boolean | null
    characterRace?: string | null
    level?: number | null
    characterStats?: Record<string, unknown> | null
  }) => void
  applySessionRoomTransitionPresence: (params: {
    sessionId: UUID
    users: Array<{ userId: UUID; username: string; roomId?: UUID; previousGroupId?: UUID }>
    targetRoomId: UUID
    targetState: PresenceState
    changedAt: number
    clearGhostForSession?: boolean
  }) => void
  setPresenceSpeakingActivity: (sessionId: UUID, userId: UUID, isSpeaking: boolean) => void
  /** Batch-replace the LiveKit speaker set for a session. Separate from
   * setPresenceSpeakingActivity so real-user LiveKit events don't stomp
   * WS-sourced mock speakers (different userId populations in dev). */
  setPresenceSpeakingUsers: (sessionId: UUID, userIds: UUID[]) => void
  handlePresenceTypingStarted: (event: EventEnvelope) => void
  handlePresenceTypingStopped: (event: EventEnvelope) => void
  clearPresenceSessionActivity: (sessionId?: UUID) => void
  /** Remove a single user's presence entry from a session immediately (voluntary leave / ghost expired). */
  removeUserSessionPresence: (sessionId: UUID, userId: UUID) => void
  handleSessionMemberJoined: (event: EventEnvelope) => void
}

function buildWsSpeakingSetFromPresence(
  presenceByUser: Record<UUID, SessionPresence>
): Record<UUID, true> | undefined {
  const speakingUsers: Record<UUID, true> = {}

  for (const [userId, presence] of Object.entries(presenceByUser) as Array<
    [UUID, SessionPresence]
  >) {
    if (presence.state === PresenceState.SPEAKING) {
      speakingUsers[userId] = true
    }
  }

  return Object.keys(speakingUsers).length > 0 ? speakingUsers : undefined
}

export const createPresenceSlice: StateCreator<PresenceSlice> = (set) => ({
  sessionPresence: {},
  sessionStatsBySessionId: {},
  presenceSpeakingBySession: {},
  presenceLkSpeakingBySession: {},
  presenceTypingBySession: {},

  replaceSessionPresenceMap: (sessionId, presenceByUser) =>
    set((state) => {
      const nextWsSpeaking = buildWsSpeakingSetFromPresence(presenceByUser)
      const presenceSpeakingBySession = { ...state.presenceSpeakingBySession }

      if (nextWsSpeaking) {
        presenceSpeakingBySession[sessionId] = nextWsSpeaking
      } else {
        delete presenceSpeakingBySession[sessionId]
      }

      return {
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: presenceByUser,
        },
        presenceSpeakingBySession,
      }
    }),

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
    characterClasses,
    multiclass,
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
              characterClasses: characterClasses ?? existingPresence?.characterClasses,
              multiclass: multiclass ?? existingPresence?.multiclass,
              characterRace: characterRace ?? existingPresence?.characterRace,
              level: level ?? existingPresence?.level,
              characterStats: characterStats ?? existingPresence?.characterStats,
              state: PresenceState.ONLINE,
              // Joining a room is an explicit active-presence signal; do not
              // carry stale disconnect-ghost state across room moves.
              ghost: false,
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
      const nextPresenceBySession = {
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
      }

      return {
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: pruneSessionPresenceEntries(nextPresenceBySession, leftAt),
        },
      }
    }),

  removeUserSessionPresence: (sessionId, userId) =>
    set((state) => {
      const byUser = state.sessionPresence[sessionId]
      if (!byUser || !byUser[userId]) return state
      const { [userId]: _removed, ...rest } = byUser
      return {
        sessionPresence: {
          ...state.sessionPresence,
          [sessionId]: rest as Record<UUID, SessionPresence>,
        },
      }
    }),

  handleSessionMemberJoined: (event) => {
    const payload = event.payload as {
      userId: UUID
      username: string
      role: string
      playerName: string | null
      avatarUrl: string | null
      characterName: string | null
      characterClass: string | null
      characterClasses: CharacterClassEntry[] | null
      multiclass: boolean
      characterRace: string | null
      level: number | null
      characterStats: Record<string, unknown> | null
      primaryRoomId: UUID | null
      state: PresenceState
      ghost: boolean
      joinedAt: number
    }

    set((storeState) => {
      const sessionId = event.sessionId as UUID
      const existing = storeState.sessionPresence[sessionId]?.[payload.userId]
      return {
        sessionPresence: {
          ...storeState.sessionPresence,
          [sessionId]: {
            ...(storeState.sessionPresence[sessionId] || {}),
            [payload.userId]: {
              ...existing,
              userId: payload.userId,
              username: payload.username,
              role: payload.role as any,
              playerName: payload.playerName ?? existing?.playerName ?? null,
              avatarUrl: payload.avatarUrl ?? existing?.avatarUrl ?? null,
              characterName: payload.characterName ?? existing?.characterName ?? null,
              characterClass: payload.characterClass ?? existing?.characterClass ?? null,
              characterClasses: payload.characterClasses ?? existing?.characterClasses ?? null,
              multiclass: payload.multiclass ?? existing?.multiclass ?? false,
              characterRace: payload.characterRace ?? existing?.characterRace ?? null,
              level: payload.level ?? existing?.level ?? null,
              characterStats: payload.characterStats ?? existing?.characterStats ?? null,
              primaryRoomId: payload.primaryRoomId ?? existing?.primaryRoomId,
              // Use the backend-authoritative state from the payload (can be IDLE for AWAY players).
              // ROOM:USER_JOINED (upsertSessionPresenceOnJoin) hardcodes ONLINE because active room
              // joins are an explicit presence signal; SESSION:MEMBER_JOINED is an announcement of
              // current state, so we must preserve it.
              state: payload.state ?? PresenceState.ONLINE,
              ghost: payload.ghost ?? false,
              lastSeenAt: payload.joinedAt,
            } as SessionPresence,
          },
        },
      }
    })
  },

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
    characterClasses,
    multiclass,
    characterRace,
    level,
    characterStats,
  }) =>
    set((currentState) => {
      const bySession = currentState.sessionPresence[sessionId] || {}
      const existing = bySession[userId]
      const resolvedRoomId = roomId || existing?.primaryRoomId
      const nextGhost = ghost !== undefined ? ghost : existing?.ghost || false
      const nextPreviousGroupId =
        previousGroupId !== undefined ? previousGroupId : existing?.previousGroupId
      const nextUsername = username || existing?.username || ''
      const nextPrimaryRoomId =
        state === PresenceState.OFFLINE ? undefined : resolvedRoomId || undefined

      const hasProfilePatch =
        playerName !== undefined ||
        avatarUrl !== undefined ||
        characterName !== undefined ||
        characterClass !== undefined ||
        characterClasses !== undefined ||
        multiclass !== undefined ||
        characterRace !== undefined ||
        level !== undefined ||
        characterStats !== undefined

      if (
        existing &&
        !hasProfilePatch &&
        existing.state === state &&
        existing.primaryRoomId === nextPrimaryRoomId &&
        existing.ghost === nextGhost &&
        existing.previousGroupId === nextPreviousGroupId &&
        existing.username === nextUsername &&
        (changedAt <= (existing.lastSeenAt || 0) ||
          ((state === PresenceState.SPEAKING || state === PresenceState.IDLE) &&
            changedAt - (existing.lastSeenAt || 0) < PRESENCE_TRANSIENT_REFRESH_INTERVAL_MS))
      ) {
        return currentState
      }

      const nextSessionPresence = {
        ...bySession,
        [userId]: {
          ...existing,
          userId,
          username: nextUsername,
          playerName: playerName !== undefined ? (playerName ?? undefined) : existing?.playerName,
          avatarUrl: avatarUrl !== undefined ? (avatarUrl ?? undefined) : existing?.avatarUrl,
          characterName:
            characterName !== undefined ? (characterName ?? undefined) : existing?.characterName,
          characterClass:
            characterClass !== undefined ? (characterClass ?? undefined) : existing?.characterClass,
          characterClasses:
            characterClasses !== undefined
              ? (characterClasses ?? undefined)
              : existing?.characterClasses,
          multiclass: multiclass !== undefined ? (multiclass ?? undefined) : existing?.multiclass,
          characterRace:
            characterRace !== undefined ? (characterRace ?? undefined) : existing?.characterRace,
          level: level !== undefined ? (level ?? undefined) : existing?.level,
          characterStats:
            characterStats !== undefined ? (characterStats ?? undefined) : existing?.characterStats,
          state,
          ghost: nextGhost,
          primaryRoomId: nextPrimaryRoomId,
          previousGroupId: nextPreviousGroupId,
          privateRoomId: existing?.privateRoomId,
          lastSeenAt: changedAt,
        },
      }

      return {
        sessionPresence: {
          ...currentState.sessionPresence,
          [sessionId]: pruneSessionPresenceEntries(nextSessionPresence, changedAt),
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
    characterClasses,
    multiclass,
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
              characterClasses:
                characterClasses !== undefined
                  ? (characterClasses ?? undefined)
                  : existing?.characterClasses,
              multiclass:
                multiclass !== undefined ? (multiclass ?? undefined) : existing?.multiclass,
              characterRace:
                characterRace !== undefined
                  ? (characterRace ?? undefined)
                  : existing?.characterRace,
              level: level !== undefined ? (level ?? undefined) : existing?.level,
              characterStats: (() => {
                if (characterStats === undefined) return existing?.characterStats
                if (characterStats === null) return undefined
                // Stats arrive in the canonical flat shape (normalizeCharacterStats);
                // merge over existing so a partial update never drops prior keys.
                const prev = existing?.characterStats as Record<string, unknown> | undefined
                return prev
                  ? { ...prev, ...(characterStats as Record<string, unknown>) }
                  : characterStats
              })(),
              primaryRoomId: resolvedRoomId,
              previousGroupId:
                previousGroupId !== undefined ? previousGroupId : existing?.previousGroupId,
              lastSeenAt: updatedAt,
            },
          },
        },
      }
    }),

  setPresenceSpeakingActivity: (sessionId, userId, isSpeaking) =>
    set((state) => {
      const current = state.presenceSpeakingBySession[sessionId]
      const currentlySpeaking = Boolean(current?.[userId])
      if (currentlySpeaking === isSpeaking) {
        return state
      }
      if (!isSpeaking) {
        if (!current) return state
        const next = { ...current }
        delete next[userId]
        const nextBySession = { ...state.presenceSpeakingBySession }
        let hasRemainingSpeakers = false
        for (const nextUserId in next) {
          if (next[nextUserId as UUID]) {
            hasRemainingSpeakers = true
            break
          }
        }

        if (!hasRemainingSpeakers) {
          delete nextBySession[sessionId]
        } else {
          nextBySession[sessionId] = next
        }
        return { presenceSpeakingBySession: nextBySession }
      }
      return {
        presenceSpeakingBySession: {
          ...state.presenceSpeakingBySession,
          [sessionId]: { ...current, [userId]: true },
        },
      }
    }),

  setPresenceSpeakingUsers: (sessionId, userIds) =>
    set((state) => {
      const currentSet = state.presenceLkSpeakingBySession[sessionId]

      if (userIds.length === 0) {
        if (!currentSet) return state
        const next = { ...state.presenceLkSpeakingBySession }
        delete next[sessionId]
        return { presenceLkSpeakingBySession: next }
      }

      if (currentSet) {
        const currentCount = Object.keys(currentSet).length
        if (currentCount === userIds.length) {
          let unchanged = true
          for (const userId of userIds) {
            if (!currentSet[userId]) {
              unchanged = false
              break
            }
          }

          if (unchanged) {
            return state
          }
        }
      }

      const nextSet: Record<UUID, true> = {}
      for (const userId of userIds) {
        nextSet[userId] = true
      }

      return {
        presenceLkSpeakingBySession: {
          ...state.presenceLkSpeakingBySession,
          [sessionId]: nextSet,
        },
      }
    }),

  handlePresenceTypingStarted: (event) => {
    const payload = event.payload as { userId: UUID; username: string; roomId?: UUID }

    set((state) => {
      const existingIndicators = state.presenceTypingBySession[event.sessionId] || []
      const currentIndicators = pruneTypingIndicators(existingIndicators, event.timestamp)
      const didPruneExpired = currentIndicators.length !== existingIndicators.length
      const existingIndex = currentIndicators.findIndex(
        (indicator) => indicator.userId === payload.userId
      )
      const existing = existingIndex >= 0 ? currentIndicators[existingIndex] : null
      const nextUntil = event.timestamp + TYPING_INDICATOR_TTL_MS

      if (
        existing &&
        existing.username === payload.username &&
        existing.roomId === payload.roomId &&
        (existing.until >= nextUntil || nextUntil - existing.until < TYPING_RENEW_MIN_EXTENSION_MS)
      ) {
        if (!didPruneExpired) {
          return state
        }

        if (currentIndicators.length === 0) {
          if (!state.presenceTypingBySession[event.sessionId]) {
            return state
          }

          const next = { ...state.presenceTypingBySession }
          delete next[event.sessionId]
          return { presenceTypingBySession: next }
        }

        return {
          presenceTypingBySession: {
            ...state.presenceTypingBySession,
            [event.sessionId]: currentIndicators,
          },
        }
      }

      const nextIndicators = currentIndicators.slice()
      const nextIndicator: TypingIndicator = {
        userId: payload.userId,
        username: payload.username,
        roomId: payload.roomId,
        until: nextUntil,
      }

      if (existingIndex >= 0) {
        nextIndicators[existingIndex] = nextIndicator
      } else {
        nextIndicators.push(nextIndicator)
      }

      return {
        presenceTypingBySession: {
          ...state.presenceTypingBySession,
          [event.sessionId]: nextIndicators,
        },
      }
    })
  },

  handlePresenceTypingStopped: (event) => {
    const payload = event.payload as { userId: UUID }

    set((state) => {
      const existingIndicators = state.presenceTypingBySession[event.sessionId] || []
      const indicators = pruneTypingIndicators(existingIndicators, event.timestamp)
      const didPruneExpired = indicators.length !== existingIndicators.length
      const removedIndex = indicators.findIndex((indicator) => indicator.userId === payload.userId)

      if (removedIndex === -1) {
        if (!didPruneExpired) {
          return state
        }

        if (indicators.length === 0) {
          if (!state.presenceTypingBySession[event.sessionId]) {
            return state
          }

          const next = { ...state.presenceTypingBySession }
          delete next[event.sessionId]
          return { presenceTypingBySession: next }
        }

        return {
          presenceTypingBySession: {
            ...state.presenceTypingBySession,
            [event.sessionId]: indicators,
          },
        }
      }

      const nextIndicators = indicators.filter((_, index) => index !== removedIndex)

      if (nextIndicators.length === 0) {
        if (!state.presenceTypingBySession[event.sessionId]) {
          return state
        }
        const next = { ...state.presenceTypingBySession }
        delete next[event.sessionId]
        return { presenceTypingBySession: next }
      }

      return {
        presenceTypingBySession: {
          ...state.presenceTypingBySession,
          [event.sessionId]: nextIndicators,
        },
      }
    })
  },

  clearPresenceSessionActivity: (sessionId) =>
    set((state) => {
      if (!sessionId) {
        return {
          presenceSpeakingBySession: {},
          presenceLkSpeakingBySession: {},
          presenceTypingBySession: {},
        }
      }

      const hasWs = Boolean(state.presenceSpeakingBySession[sessionId])
      const hasLk = Boolean(state.presenceLkSpeakingBySession[sessionId])
      const hasTyping = Boolean(state.presenceTypingBySession[sessionId])

      if (!hasWs && !hasLk && !hasTyping) return state

      const nextWs = hasWs
        ? (() => {
            const n = { ...state.presenceSpeakingBySession }
            delete n[sessionId]
            return n
          })()
        : state.presenceSpeakingBySession

      const nextLk = hasLk
        ? (() => {
            const n = { ...state.presenceLkSpeakingBySession }
            delete n[sessionId]
            return n
          })()
        : state.presenceLkSpeakingBySession

      const nextTyping = hasTyping
        ? (() => {
            const n = { ...state.presenceTypingBySession }
            delete n[sessionId]
            return n
          })()
        : state.presenceTypingBySession

      return {
        presenceSpeakingBySession: nextWs,
        presenceLkSpeakingBySession: nextLk,
        presenceTypingBySession: nextTyping,
      }
    }),

  applySessionRoomTransitionPresence: ({
    sessionId,
    users,
    targetRoomId,
    targetState,
    changedAt,
    clearGhostForSession,
  }) =>
    set((state) => {
      const nextPresenceBySession = {
        ...(state.sessionPresence[sessionId] || {}),
      } as Record<UUID, SessionPresence>

      if (clearGhostForSession) {
        for (const [userId, presence] of Object.entries(nextPresenceBySession) as Array<
          [UUID, SessionPresence]
        >) {
          if (!presence?.ghost) {
            continue
          }

          nextPresenceBySession[userId] = {
            ...presence,
            ghost: false,
          }
        }
      }

      for (const user of users) {
        const existingPresence = nextPresenceBySession[user.userId]
        const nextRoomId = user.roomId || targetRoomId
        nextPresenceBySession[user.userId] = {
          ...existingPresence,
          userId: user.userId,
          username: user.username,
          state: targetState,
          primaryRoomId: nextRoomId,
          ghost: false,
          previousGroupId:
            user.previousGroupId !== undefined
              ? user.previousGroupId || undefined
              : existingPresence?.previousGroupId,
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
