/**
 * Session Slice (Zustand)
 * Manages session state (creation, state transitions, metadata).
 * Reference: docs/architecture/SESSION-LIFECYCLE.md
 */

import type { StateCreator } from 'zustand'
import type { UUID, SessionState } from '@shared'
import type { EventEnvelope } from '@shared'
import type { Session } from '@/types/session'

export type { Session } from '@/types/session'

export interface SessionSlice {
  // State
  sessions: Record<UUID, Session>
  currentSessionId: UUID | null
  isGreenroom: boolean
  isLoading: boolean

  // Actions
  createSession: (session: Session) => void
  replaceSessions: (sessions: Session[]) => void
  updateSession: (sessionId: UUID, updates: Partial<Session>) => void
  removeSession: (sessionId: UUID) => void
  setCurrentSession: (sessionId: UUID | null) => void
  setIsGreenroom: (value: boolean) => void
  clearSessions: () => void

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
        isGreenroom:
          !currentSession ||
          currentSession.state === ('IDLE' as SessionState) ||
          currentSession.state === ('ENDED' as SessionState),
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
      const currentSession = state.currentSessionId ? nextSessions[state.currentSessionId] : null

      return {
        sessions: nextSessions,
        isGreenroom:
          !currentSession ||
          currentSession.state === ('IDLE' as SessionState) ||
          currentSession.state === ('ENDED' as SessionState),
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
        isGreenroom:
          !currentSession ||
          currentSession.state === ('IDLE' as SessionState) ||
          currentSession.state === ('ENDED' as SessionState),
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
        isGreenroom:
          !currentSession ||
          currentSession.state === ('IDLE' as SessionState) ||
          currentSession.state === ('ENDED' as SessionState),
      }
    }),

  setCurrentSession: (sessionId) =>
    set((state) => {
      const currentSession = sessionId ? state.sessions[sessionId] : null
      return {
        currentSessionId: sessionId,
        isGreenroom:
          !currentSession ||
          currentSession.state === ('IDLE' as SessionState) ||
          currentSession.state === ('ENDED' as SessionState),
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
          state: 'IDLE' as SessionState,
          description: payload.description,
          createdAt: event.timestamp,
        },
      },
      isGreenroom:
        !state.currentSessionId ||
        state.sessions[state.currentSessionId]?.state === ('IDLE' as SessionState) ||
        state.sessions[state.currentSessionId]?.state === ('ENDED' as SessionState),
    }))
  },

  handleSessionStateChanged: (event) => {
    const payload = event.payload as { state: SessionState }
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

      return {
        sessions: nextSessions,
        isGreenroom:
          !currentSession ||
          currentSession.state === ('IDLE' as SessionState) ||
          currentSession.state === ('ENDED' as SessionState),
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
        isGreenroom:
          !currentSession ||
          currentSession.state === ('IDLE' as SessionState) ||
          currentSession.state === ('ENDED' as SessionState),
      }
    })
  },
})
