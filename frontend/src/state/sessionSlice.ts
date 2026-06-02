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

      return {
        sessions: nextSessions,
        currentSessionId: nextCurrentSessionId,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
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
      return {
        currentSessionId: sessionId,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
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
      // Guard: only update if session exists (prevent partial shapes from unknown WS events)
      if (!state.sessions[event.sessionId]) {
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

      const nextCooldownExtensionCounts = { ...state.cooldownExtensionCounts }
      if (payload.state === 'COOLDOWN') {
        nextCooldownExtensionCounts[event.sessionId] =
          nextCooldownExtensionCounts[event.sessionId] ?? 0
      } else if (
        payload.state === 'ACTIVE' ||
        payload.state === 'IDLE' ||
        payload.state === 'ENDED'
      ) {
        nextCooldownExtensionCounts[event.sessionId] = 0
      }

      // AUTO-REBIND: If a fresh session starts and currentSessionId is different,
      // force-bind to the new session. This occurs when:
      // 1. DM creates a new session (IDLE → ACTIVE)
      // 2. DM resets and starts a new session after ending (ENDED → ACTIVE)
      // Players must be forced to the new session so WS client auth/binding updates.
      const shouldRebind =
        isFreshSessionStart &&
        state.currentSessionId !== event.sessionId &&
        state.currentSessionId !== null

      const nextCurrentSessionId = shouldRebind ? event.sessionId : state.currentSessionId
      const currentSession = nextCurrentSessionId
        ? sessionById(nextSessions, nextCurrentSessionId)
        : null

      return {
        sessions: nextSessions,
        currentSessionId: nextCurrentSessionId,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        pauseStats: { ...state.pauseStats, [event.sessionId]: nextStats },
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
