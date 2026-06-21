/**
 * Session Slice (Zustand)
 * Manages session state (creation, state transitions, metadata).
 * Reference: docs/architecture/SESSION-LIFECYCLE.md
 */

import type { StateCreator } from 'zustand'
import type { UUID, SessionLifecycleState } from '@shared'
import type { EventEnvelope } from '@shared'
import { isGreenroomSessionState } from '@shared'
import type { Session } from '@/types/session'

/** Lookup helper — avoids branded-UUID index issues throughout the slice */
const sessionById = (sessions: Record<UUID, Session>, id: UUID | string | null): Session | null =>
  id ? ((sessions as Record<string, Session>)[id] ?? null) : null

const hasSessionChanges = (session: Session, updates: Partial<Session>): boolean => {
  for (const [key, value] of Object.entries(updates)) {
    if (!Object.is(session[key as keyof Session], value as Session[keyof Session])) {
      return true
    }
  }

  return false
}

/** Shallow per-field equality for two session records (all session fields are primitives). */
const sessionRecordShallowEqual = (a: Session, b: Session): boolean => {
  if (a === b) return true
  const aKeys = Object.keys(a) as Array<keyof Session>
  if (aKeys.length !== Object.keys(b).length) return false
  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false
  }
  return true
}

/** True iff two session maps hold the same ids and shallow-equal records. */
const sessionsMapShallowEqual = (
  a: Record<UUID, Session>,
  b: Record<UUID, Session>
): boolean => {
  if (a === b) return true
  const aIds = Object.keys(a)
  if (aIds.length !== Object.keys(b).length) return false
  for (const id of aIds) {
    const right = (b as Record<string, Session>)[id]
    if (!right || !sessionRecordShallowEqual((a as Record<string, Session>)[id], right)) {
      return false
    }
  }
  return true
}

const pauseStatsEqual = (a: SessionPauseStats, b: SessionPauseStats): boolean =>
  Object.is(a.cumulativePauseMs, b.cumulativePauseMs) &&
  Object.is(a.pauseCount, b.pauseCount) &&
  Object.is(a.pauseStartedAt, b.pauseStartedAt)

/** Shallow equality for a keyed record using the supplied value comparator. */
const recordShallowEqual = <T>(
  a: Record<string, T>,
  b: Record<string, T>,
  isEqual: (x: T, y: T) => boolean
): boolean => {
  if (a === b) return true
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  for (const key of aKeys) {
    if (!(key in b) || !isEqual(a[key], b[key])) return false
  }
  return true
}

export type { Session } from '@/types/session'

export interface SessionPauseStats {
  cumulativePauseMs: number
  pauseCount: number
  pauseStartedAt: number | undefined
}

export interface SessionSlice {
  // State
  sessions: Record<UUID, Session>
  currentSessionId: UUID | null
  isGreenroom: boolean
  isLoading: boolean
  pauseStats: Record<UUID, SessionPauseStats>
  cooldownExtensionCounts: Record<UUID, number>

  // Actions
  createSession: (session: Session) => void
  replaceSessions: (sessions: Session[]) => void
  updateSession: (sessionId: UUID, updates: Partial<Session>) => void
  removeSession: (sessionId: UUID) => void
  setCurrentSession: (sessionId: UUID | null) => void
  setIsGreenroom: (value: boolean) => void
  clearSessions: () => void
  clearPauseStats: (sessionId: UUID) => void
  hydrateSessionPauseStats: (session: Session) => void
  setCooldownExtensionCount: (sessionId: UUID, count: number) => void

  // Event handlers
  handleSessionCreated: (event: EventEnvelope) => void
  handleSessionStateChanged: (event: EventEnvelope) => void
  handleSessionCooldownStarted: (event: EventEnvelope) => void
  handleSessionCooldownExtended: (event: EventEnvelope) => void
  handleSessionCooldownEnded: (event: EventEnvelope) => void
  handleSessionEnded: (event: EventEnvelope) => void
}

export const createSessionSlice: StateCreator<SessionSlice> = (set) => ({
  // Helper keeps "greenroom mode" in one place.
  // Treat IDLE/ENDED/no-session as greenroom states.
  // This allows UI to reliably switch back after a chapter ends.

  // State
  sessions: {},
  currentSessionId: null,
  isGreenroom: true,
  isLoading: false,
  pauseStats: {},
  cooldownExtensionCounts: {},

  // Actions
  createSession: (session) =>
    set((state) => {
      const nextSessions = {
        ...state.sessions,
        [session.id]: session,
      }
      const currentSession = state.currentSessionId
        ? sessionById(nextSessions, state.currentSessionId)
        : null

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
      }
    }),

  replaceSessions: (sessions) =>
    set((state) => {
      const nextSessions = sessions.reduce(
        (acc, session) => {
          acc[session.id] = session
          return acc
        },
        {} as Record<UUID, Session>
      )
      const nextCurrentSessionId =
        state.currentSessionId && sessionById(nextSessions, state.currentSessionId)
          ? state.currentSessionId
          : null
      const currentSession = nextCurrentSessionId
        ? sessionById(nextSessions, nextCurrentSessionId)
        : null

      // Hydrate pauseStats from loaded sessions
      const nextPauseStats = { ...state.pauseStats }
      const nextCooldownExtensionCounts = { ...state.cooldownExtensionCounts }
      for (const session of sessions) {
        nextPauseStats[session.id] = {
          cumulativePauseMs: session.cumulativePauseMs ?? 0,
          pauseCount: session.pauseCount ?? 0,
          pauseStartedAt: session.pauseStartedAt,
        }

        if (
          typeof session.cooldownExtensionCount === 'number' &&
          Number.isFinite(session.cooldownExtensionCount)
        ) {
          nextCooldownExtensionCounts[session.id] = Math.max(
            0,
            Math.round(session.cooldownExtensionCount)
          )
        } else if (session.state !== 'COOLDOWN') {
          nextCooldownExtensionCounts[session.id] = 0
        } else {
          nextCooldownExtensionCounts[session.id] = nextCooldownExtensionCounts[session.id] ?? 0
        }
      }

      const nextIsGreenroom = isGreenroomSessionState(currentSession?.state)

      // No-op guard: the lobby/campaign-entry orchestration refetches the session
      // list on entry and after transitions. When the payload is identical to what
      // we already hold, replacing the maps would hand fresh object references to
      // every `sessions`/`currentSession` subscriber (notably the session-workspace
      // chrome via `baseProps`), re-rendering them for nothing. Skip the write when
      // nothing actually changed.
      if (
        nextCurrentSessionId === state.currentSessionId &&
        nextIsGreenroom === state.isGreenroom &&
        sessionsMapShallowEqual(nextSessions, state.sessions) &&
        recordShallowEqual(nextPauseStats, state.pauseStats, pauseStatsEqual) &&
        recordShallowEqual(nextCooldownExtensionCounts, state.cooldownExtensionCounts, Object.is)
      ) {
        return state
      }

      return {
        sessions: nextSessions,
        currentSessionId: nextCurrentSessionId,
        isGreenroom: nextIsGreenroom,
        pauseStats: nextPauseStats,
        cooldownExtensionCounts: nextCooldownExtensionCounts,
      }
    }),

  updateSession: (sessionId, updates) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state

      if (!hasSessionChanges(session, updates)) {
        return state
      }

      const nextSession = { ...session, ...updates }
      const nextSessions = {
        ...state.sessions,
        [sessionId]: nextSession,
      }
      const currentSession = state.currentSessionId
        ? sessionById(nextSessions, state.currentSessionId)
        : null

      // Hydrate pauseStats from updated session
      const nextPauseStats = { ...state.pauseStats }
      nextPauseStats[sessionId] = {
        cumulativePauseMs: nextSession.cumulativePauseMs ?? 0,
        pauseCount: nextSession.pauseCount ?? 0,
        pauseStartedAt: nextSession.pauseStartedAt,
      }

      const nextCooldownExtensionCounts = { ...state.cooldownExtensionCounts }
      if (
        typeof nextSession.cooldownExtensionCount === 'number' &&
        Number.isFinite(nextSession.cooldownExtensionCount)
      ) {
        nextCooldownExtensionCounts[sessionId] = Math.max(
          0,
          Math.round(nextSession.cooldownExtensionCount)
        )
      } else if (nextSession.state !== 'COOLDOWN') {
        nextCooldownExtensionCounts[sessionId] = 0
      }

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        pauseStats: nextPauseStats,
        cooldownExtensionCounts: nextCooldownExtensionCounts,
      }
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const nextSessions = { ...state.sessions }
      delete nextSessions[sessionId]
      const nextCurrentSessionId =
        state.currentSessionId === sessionId ? null : state.currentSessionId
      const currentSession = nextCurrentSessionId
        ? sessionById(nextSessions, nextCurrentSessionId)
        : null

      return {
        sessions: nextSessions,
        currentSessionId: nextCurrentSessionId,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
      }
    }),

  setCurrentSession: (sessionId) =>
    set((state) => {
      const currentSession = sessionId ? sessionById(state.sessions, sessionId) : null
      const nextIsGreenroom = isGreenroomSessionState(currentSession?.state)

      // No-op guard: rebind paths (e.g. SESSION:STATE_CHANGED auto-rebind, hydration)
      // frequently re-set the already-current session. `currentSessionId` is one of the
      // most widely-subscribed store fields, so an identity-only change would re-render a
      // large part of the tree for no state change.
      if (sessionId === state.currentSessionId && nextIsGreenroom === state.isGreenroom) {
        return state
      }

      return {
        currentSessionId: sessionId,
        isGreenroom: nextIsGreenroom,
      }
    }),

  setIsGreenroom: (value) =>
    set({
      isGreenroom: value,
    }),

  clearSessions: () =>
    set({
      sessions: {},
      currentSessionId: null,
      isGreenroom: true,
    }),

  clearPauseStats: (sessionId) =>
    set((state) => {
      const next = { ...state.pauseStats }
      delete next[sessionId]
      return { pauseStats: next }
    }),

  hydrateSessionPauseStats: (session) =>
    set((state) => {
      // Initialize pauseStats from backend session data on hydration
      return {
        pauseStats: {
          ...state.pauseStats,
          [session.id]: {
            cumulativePauseMs: session.cumulativePauseMs ?? 0,
            pauseCount: session.pauseCount ?? 0,
            pauseStartedAt: session.pauseStartedAt,
          },
        },
      }
    }),

  setCooldownExtensionCount: (sessionId, count) =>
    set((state) => ({
      cooldownExtensionCounts: {
        ...state.cooldownExtensionCounts,
        [sessionId]: Math.max(0, Math.round(Number.isFinite(count) ? count : 0)),
      },
    })),

  // Event handlers
  handleSessionCreated: (event) => {
    const payload = event.payload as { id: UUID; name: string; dmId: UUID; description?: string }
    set((state) => ({
      sessions: {
        ...state.sessions,
        [payload.id]: {
          id: payload.id,
          name: payload.name,
          dmId: payload.dmId,
          state: 'IDLE' as SessionLifecycleState,
          description: payload.description,
          createdAt: event.timestamp,
        },
      },
      cooldownExtensionCounts: {
        ...state.cooldownExtensionCounts,
        [payload.id]: 0,
      },
      isGreenroom: isGreenroomSessionState(
        state.currentSessionId
          ? sessionById(state.sessions, state.currentSessionId)?.state
          : undefined
      ),
    }))
  },

  handleSessionStateChanged: (event) => {
    const payload = event.payload as { state: SessionLifecycleState }
    set((state) => {
      // AUTO-REBIND pre-check: run BEFORE the session-existence guard so a fresh
      // ACTIVE start still triggers WS rebind even when SESSION:CREATED was missed
      // or arrived out of order. The WS client auth is updated via currentSessionId,
      // so we must not skip this when the session record is absent from the store.
      if (!state.sessions[event.sessionId]) {
        if (payload.state === 'ACTIVE' && state.currentSessionId !== event.sessionId) {
          return {
            currentSessionId: event.sessionId as UUID,
            isGreenroom: false,
          }
        }
        return state
      }

      const existing = state.sessions[event.sessionId]
      const isFreshSessionStart =
        payload.state === 'ACTIVE' &&
        (existing.state === 'IDLE' ||
          existing.state === 'ENDED' ||
          existing.state === 'CLEANUP' ||
          existing.startedAt === undefined)

      // Compute pause stats first so they can be mirrored into the session record.
      // All timestamps here come from event.timestamp (server-set), so every
      // connected client accumulates identical values regardless of when the WS
      // event is locally delivered.
      const prevStats: SessionPauseStats = state.pauseStats[event.sessionId] ?? {
        cumulativePauseMs: existing.cumulativePauseMs ?? 0,
        pauseCount: existing.pauseCount ?? 0,
        pauseStartedAt: existing.pauseStartedAt,
      }
      let nextStats = prevStats

      if (isFreshSessionStart) {
        nextStats = { cumulativePauseMs: 0, pauseCount: 0, pauseStartedAt: undefined }
      } else if (payload.state === 'PAUSED') {
        // Record when this pause began (server timestamp → same for all clients)
        nextStats = { ...prevStats, pauseStartedAt: event.timestamp }
      } else if (payload.state === 'ACTIVE' && prevStats.pauseStartedAt !== undefined) {
        // Resuming from pause — accumulate using the server-provided resume timestamp
        const pauseSegmentMs = event.timestamp - prevStats.pauseStartedAt
        nextStats = {
          cumulativePauseMs: prevStats.cumulativePauseMs + pauseSegmentMs,
          pauseCount: prevStats.pauseCount + 1,
          pauseStartedAt: undefined,
        }
      } else if (
        payload.state === 'IDLE' ||
        payload.state === 'ENDED' ||
        payload.state === 'CLEANUP'
      ) {
        nextStats = { ...prevStats, pauseStartedAt: undefined }
      }

      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...existing,
          state: payload.state,
          startedAt: isFreshSessionStart ? event.timestamp : existing.startedAt,
          pausedAt:
            payload.state === 'PAUSED'
              ? event.timestamp
              : payload.state === 'ACTIVE'
                ? undefined
                : existing.pausedAt,
          endedAt:
            payload.state === 'COOLDOWN' || payload.state === 'ENDED'
              ? event.timestamp
              : payload.state === 'ACTIVE'
                ? undefined
                : existing.endedAt,
          cooldownExpiresAt:
            payload.state === 'COOLDOWN'
              ? existing.cooldownExpiresAt
              : payload.state === 'ACTIVE' ||
                  payload.state === 'IDLE' ||
                  payload.state === 'ENDED' ||
                  payload.state === 'CLEANUP'
                ? undefined
                : existing.cooldownExpiresAt,
          // Mirror accumulated pause stats so the session record is always the
          // single authoritative source for timer anchors.  All values are
          // derived from server-provided event timestamps and are therefore
          // identical across every connected client.
          cumulativePauseMs: nextStats.cumulativePauseMs,
          pauseCount: nextStats.pauseCount,
          pauseStartedAt: nextStats.pauseStartedAt,
        },
      }

      // Reuse the existing map reference when the count is unchanged. Otherwise a
      // PAUSED/RESUMED transition (which never touches the count) would still hand a
      // fresh `cooldownExtensionCounts` object to its subscribers (the session chrome
      // reads it as a standalone prop), re-rendering them for nothing.
      const prevCooldownCount = state.cooldownExtensionCounts[event.sessionId]
      let nextCooldownCount = prevCooldownCount
      if (payload.state === 'COOLDOWN') {
        nextCooldownCount = prevCooldownCount ?? 0
      } else if (
        payload.state === 'ACTIVE' ||
        payload.state === 'IDLE' ||
        payload.state === 'ENDED'
      ) {
        nextCooldownCount = 0
      }
      const nextCooldownExtensionCounts =
        nextCooldownCount === prevCooldownCount
          ? state.cooldownExtensionCounts
          : { ...state.cooldownExtensionCounts, [event.sessionId]: nextCooldownCount }

      // AUTO-REBIND: If a fresh session starts and currentSessionId is different,
      // force-bind to the new session. This occurs when:
      // 1. DM creates a new session (IDLE → ACTIVE)
      // 2. DM resets and starts a new session after ending (ENDED → ACTIVE)
      // Players must be forced to the new session so WS client auth/binding updates.
      const shouldRebind = isFreshSessionStart && state.currentSessionId !== event.sessionId

      const nextCurrentSessionId = shouldRebind ? event.sessionId : state.currentSessionId
      const currentSession = nextCurrentSessionId
        ? sessionById(nextSessions, nextCurrentSessionId)
        : null

      // Reuse the pauseStats map reference when this session's stats are unchanged
      // (e.g. COOLDOWN/ENDED with no prior pause), so pause-stat subscribers don't
      // re-render purely from a new container object.
      const prevStoredStats = state.pauseStats[event.sessionId]
      const nextPauseStatsMap =
        prevStoredStats && pauseStatsEqual(prevStoredStats, nextStats)
          ? state.pauseStats
          : { ...state.pauseStats, [event.sessionId]: nextStats }

      return {
        sessions: nextSessions,
        currentSessionId: nextCurrentSessionId,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        pauseStats: nextPauseStatsMap,
        cooldownExtensionCounts: nextCooldownExtensionCounts,
      }
    })
  },

  handleSessionEnded: (event) => {
    set((state) => {
      const endedExisting = state.sessions[event.sessionId]
      if (!endedExisting) return state
      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...endedExisting,
          state: 'ENDED' as SessionLifecycleState,
          endedAt: event.timestamp,
          cooldownExpiresAt: undefined,
        },
      }
      const currentSession = state.currentSessionId
        ? sessionById(nextSessions, state.currentSessionId)
        : null

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
      }
    })
  },

  handleSessionCooldownStarted: (event) => {
    const payload = event.payload as { cooldownExpiresAt?: number; cooldownStartedAt?: number }
    set((state) => {
      const current = state.sessions[event.sessionId]
      if (!current) {
        return state
      }

      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...current,
          state: 'COOLDOWN' as SessionLifecycleState,
          endedAt: payload.cooldownStartedAt ?? current.endedAt,
          cooldownExpiresAt:
            typeof payload.cooldownExpiresAt === 'number' &&
            Number.isFinite(payload.cooldownExpiresAt)
              ? payload.cooldownExpiresAt
              : current.cooldownExpiresAt,
        },
      }

      const currentSession = state.currentSessionId
        ? sessionById(nextSessions, state.currentSessionId)
        : null

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        cooldownExtensionCounts: {
          ...state.cooldownExtensionCounts,
          [event.sessionId]: 0,
        },
      }
    })
  },

  handleSessionCooldownExtended: (event) => {
    const payload = event.payload as {
      endedAt?: number | null
      cooldownExpiresAt?: number | null
      extensionCount?: number
    }
    set((state) => {
      const current = state.sessions[event.sessionId]
      if (!current) {
        return state
      }

      const nextEndedAt =
        typeof payload.endedAt === 'number' && Number.isFinite(payload.endedAt)
          ? payload.endedAt
          : current.endedAt

      const nextExtensionCount =
        typeof payload.extensionCount === 'number' && Number.isFinite(payload.extensionCount)
          ? payload.extensionCount
          : (state.cooldownExtensionCounts[event.sessionId] ?? 0) + 1

      const nextCooldownExpiresAt =
        typeof payload.cooldownExpiresAt === 'number' && Number.isFinite(payload.cooldownExpiresAt)
          ? payload.cooldownExpiresAt
          : current.cooldownExpiresAt

      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...current,
          state: 'COOLDOWN' as SessionLifecycleState,
          endedAt: nextEndedAt,
          cooldownExpiresAt: nextCooldownExpiresAt,
        },
      }

      const currentSession = state.currentSessionId
        ? sessionById(nextSessions, state.currentSessionId)
        : null

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        cooldownExtensionCounts: {
          ...state.cooldownExtensionCounts,
          [event.sessionId]: nextExtensionCount,
        },
      }
    })
  },

  handleSessionCooldownEnded: (event) => {
    const payload = event.payload as { endedAt?: number | null }
    set((state) => {
      const current = state.sessions[event.sessionId]
      if (!current) {
        return state
      }

      const nextEndedAt =
        typeof payload.endedAt === 'number' && Number.isFinite(payload.endedAt)
          ? payload.endedAt
          : event.timestamp

      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...current,
          state: 'ENDED' as SessionLifecycleState,
          endedAt: nextEndedAt,
          cooldownExpiresAt: undefined,
        },
      }

      const currentSession = state.currentSessionId
        ? sessionById(nextSessions, state.currentSessionId)
        : null

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        cooldownExtensionCounts: {
          ...state.cooldownExtensionCounts,
          [event.sessionId]: 0,
        },
      }
    })
  },
})
