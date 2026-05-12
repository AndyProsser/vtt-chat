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

  // Event handlers
  handleSessionCreated: (event: EventEnvelope) => void
  handleSessionStateChanged: (event: EventEnvelope) => void
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
      const currentSession = state.currentSessionId ? nextSessions[state.currentSessionId] : null

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
        state.currentSessionId && nextSessions[state.currentSessionId]
          ? state.currentSessionId
          : null
      const currentSession = nextCurrentSessionId ? nextSessions[nextCurrentSessionId] : null

      return {
        sessions: nextSessions,
        currentSessionId: nextCurrentSessionId,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
      }
    }),

  updateSession: (sessionId, updates) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state

      const nextSessions = {
        ...state.sessions,
        [sessionId]: { ...session, ...updates },
      }
      const currentSession = state.currentSessionId ? nextSessions[state.currentSessionId] : null

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
      }
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const nextSessions = { ...state.sessions }
      delete nextSessions[sessionId]
      const nextCurrentSessionId =
        state.currentSessionId === sessionId ? null : state.currentSessionId
      const currentSession = nextCurrentSessionId ? nextSessions[nextCurrentSessionId] : null

      return {
        sessions: nextSessions,
        currentSessionId: nextCurrentSessionId,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
      }
    }),

  setCurrentSession: (sessionId) =>
    set((state) => {
      const currentSession = sessionId ? state.sessions[sessionId] : null
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
          state: 'INACTIVE' as SessionLifecycleState,
          description: payload.description,
          createdAt: event.timestamp,
        },
      },
      isGreenroom: isGreenroomSessionState(state.sessions[state.currentSessionId]?.state),
    }))
  },

  handleSessionStateChanged: (event) => {
    const payload = event.payload as { state: SessionLifecycleState }
    set((state) => {
      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...state.sessions[event.sessionId]!,
          state: payload.state,
          startedAt:
            payload.state === 'ACTIVE'
              ? event.timestamp
              : state.sessions[event.sessionId]?.startedAt,
          pausedAt:
            payload.state === 'PAUSED'
              ? event.timestamp
              : state.sessions[event.sessionId]?.pausedAt,
          endedAt:
            payload.state === 'ENDED' ? event.timestamp : state.sessions[event.sessionId]?.endedAt,
        },
      }
      const currentSession = state.currentSessionId ? nextSessions[state.currentSessionId] : null

      // Accumulate pause stats client-side for server-synchronized timer
      const prevStats: SessionPauseStats = state.pauseStats[event.sessionId] ?? {
        cumulativePauseMs: 0,
        pauseCount: 0,
        pauseStartedAt: undefined,
      }
      let nextStats = prevStats

      if (payload.state === 'PAUSED') {
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
      } else if (payload.state === 'INACTIVE' || payload.state === 'ENDED') {
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
      const nextSessions = {
        ...state.sessions,
        [event.sessionId]: {
          ...state.sessions[event.sessionId]!,
          state: 'ENDED' as SessionState,
          endedAt: event.timestamp,
        },
      }
      const currentSession = state.currentSessionId ? nextSessions[state.currentSessionId] : null

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
      }
    })
  },
})
