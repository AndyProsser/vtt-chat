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
      const currentSession = state.currentSessionId ? nextSessions[state.currentSessionId] : null

      return {
        sessions: nextSessions,
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

      return {
        sessions: nextSessions,
        isGreenroom: isGreenroomSessionState(currentSession?.state),
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
