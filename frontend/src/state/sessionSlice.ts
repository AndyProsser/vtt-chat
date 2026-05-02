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
  isLoading: boolean

  // Actions
  createSession: (session: Session) => void
  replaceSessions: (sessions: Session[]) => void
  updateSession: (sessionId: UUID, updates: Partial<Session>) => void
  removeSession: (sessionId: UUID) => void
  setCurrentSession: (sessionId: UUID | null) => void
  clearSessions: () => void

  // Event handlers
  handleSessionCreated: (event: EventEnvelope) => void
  handleSessionStateChanged: (event: EventEnvelope) => void
  handleSessionEnded: (event: EventEnvelope) => void
}

export const createSessionSlice: StateCreator<SessionSlice> = (set) => ({
  // State
  sessions: {},
  currentSessionId: null,
  isLoading: false,

  // Actions
  createSession: (session) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [session.id]: session,
      },
    })),

  replaceSessions: (sessions) =>
    set(() => ({
      sessions: sessions.reduce(
        (acc, session) => {
          acc[session.id] = session
          return acc
        },
        {} as Record<UUID, Session>
      ),
    })),

  updateSession: (sessionId, updates) =>
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, ...updates },
        },
      }
    }),

  removeSession: (sessionId) =>
    set((state) => {
      const nextSessions = { ...state.sessions }
      delete nextSessions[sessionId]

      return {
        sessions: nextSessions,
        currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
      }
    }),

  setCurrentSession: (sessionId) =>
    set({
      currentSessionId: sessionId,
    }),

  clearSessions: () =>
    set({
      sessions: {},
      currentSessionId: null,
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
    }))
  },

  handleSessionStateChanged: (event) => {
    const payload = event.payload as { state: SessionState }
    set((state) => ({
      sessions: {
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
      },
    }))
  },

  handleSessionEnded: (event) => {
    set((state) => ({
      sessions: {
        ...state.sessions,
        [event.sessionId]: {
          ...state.sessions[event.sessionId]!,
          state: 'ENDED' as SessionState,
          endedAt: event.timestamp,
        },
      },
    }))
  },
})
