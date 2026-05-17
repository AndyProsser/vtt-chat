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
      for (const session of sessions) {
        nextPauseStats[session.id] = {
          cumulativePauseMs: session.cumulativePauseMs ?? 0,
          pauseCount: session.pauseCount ?? 0,
          pauseStartedAt: session.pauseStartedAt,
        }
      }

      return {
        sessions: nextSessions,
        currentSessionId: nextCurrentSessionId,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        pauseStats: nextPauseStats,
      }
    }),

  updateSession: (sessionId, updates) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state

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

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        pauseStats: nextPauseStats,
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
            payload.state === 'ENDED'
              ? event.timestamp
              : payload.state === 'ACTIVE'
                ? undefined
                : existing.endedAt,
        },
      }
      const currentSession = state.currentSessionId
        ? sessionById(nextSessions, state.currentSessionId)
        : null

      // Accumulate pause stats client-side for server-synchronized timer
      const prevStats: SessionPauseStats = state.pauseStats[event.sessionId] ?? {
        cumulativePauseMs: 0,
        pauseCount: 0,
        pauseStartedAt: undefined,
      }
      let nextStats = prevStats

      if (isFreshSessionStart) {
        nextStats = {
          cumulativePauseMs: 0,
          pauseCount: 0,
          pauseStartedAt: undefined,
        }
      } else if (payload.state === 'PAUSED') {
        // Record when this pause began
        nextStats = { ...prevStats, pauseStartedAt: event.timestamp }
      } else if (payload.state === 'ACTIVE' && prevStats.pauseStartedAt !== undefined) {
        // Resuming from pause — accumulate the pause segment
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
        // Session ended or reset — keep stats until explicit clear
        nextStats = { ...prevStats, pauseStartedAt: undefined }
      }

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
        pauseStats: { ...state.pauseStats, [event.sessionId]: nextStats },
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

  handleSessionCooldownExtended: (event) => {
    const payload = event.payload as { endedAt?: number | null }
    set((state) => {
      const current = state.sessions[event.sessionId]
      if (!current) {
        return state
      }

      const nextEndedAt =
        typeof payload.endedAt === 'number' && Number.isFinite(payload.endedAt)
          ? payload.endedAt
          : current.endedAt

      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...current,
          state: 'ENDED' as SessionLifecycleState,
          endedAt: nextEndedAt,
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

  handleSessionCooldownEnded: (event) => {
    // Cooldown ended early — keep state as ENDED but signal via endedAt = 0 so
    // countdown timers immediately read as expired.
    set((state) => {
      const current = state.sessions[event.sessionId]
      if (!current) {
        return state
      }

      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...current,
          state: 'ENDED' as SessionLifecycleState,
          endedAt: 0,
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
})
