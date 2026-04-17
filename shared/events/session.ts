/**
 * Session Lifecycle Events
 * Reference: docs/architecture/SESSION-LIFECYCLE.md
 *
 * Session events control the state machine: idle → active → paused → ended.
 * Only DM can transition session state.
 * Visibility: All state changes are visible to all session participants.
 */

import type { UUID, SessionState } from '../types'
import type { EventEnvelope } from './base'

export type SessionEventType =
  | 'SESSION:CREATED'
  | 'SESSION:STARTED'
  | 'SESSION:PAUSED'
  | 'SESSION:RESUMED'
  | 'SESSION:ENDED'
  | 'SESSION:ARCHIVED'

/**
 * SESSION:CREATED
 * DM creates a new session (moves from IDLE to empty).
 * Must occur before participants can join.
 */
export interface SessionCreated {
  sessionId: UUID
  dmId: UUID
  dmUsername: string
  sessionName: string
  description?: string
  createdAt: number
}

export type SessionCreatedEvent = EventEnvelope<SessionCreated>

/**
 * SESSION:STARTED
 * DM starts the session (IDLE → ACTIVE).
 * Players can now join, chat, and access rooms.
 */
export interface SessionStarted {
  sessionId: UUID
  dmId: UUID
  startedAt: number
}

export type SessionStartedEvent = EventEnvelope<SessionStarted>

/**
 * SESSION:PAUSED
 * DM pauses the session (ACTIVE → PAUSED).
 * Chat continues, but timers/effects may halt (implementation-specific).
 * pauseReason is DM-only visible.
 */
export interface SessionPaused {
  sessionId: UUID
  dmId: UUID
  pausedAt: number
  /** Internal reason visible only to DM (e.g., "Rules discussion") */
  pauseReason?: string
}

export type SessionPausedEvent = EventEnvelope<SessionPaused>

/**
 * SESSION:RESUMED
 * DM resumes the session (PAUSED → ACTIVE).
 */
export interface SessionResumed {
  sessionId: UUID
  dmId: UUID
  resumedAt: number
}

export type SessionResumedEvent = EventEnvelope<SessionResumed>

/**
 * SESSION:ENDED
 * DM ends the session (ACTIVE → ENDED).
 * Chat freezes, no more state changes allowed.
 * Session becomes read-only for all participants.
 */
export interface SessionEnded {
  sessionId: UUID
  dmId: UUID
  endedAt: number
  summary?: string
}

export type SessionEndedEvent = EventEnvelope<SessionEnded>

/**
 * SESSION:ARCHIVED
 * Admin or DM archives the session (prevents accidental access).
 * Session is no longer joinable, but remains readable.
 */
export interface SessionArchived {
  sessionId: UUID
  dmId: UUID
  archivedBy: UUID
  archivedAt: number
}

export type SessionArchivedEvent = EventEnvelope<SessionArchived>

/**
 * Union type for all session events.
 */
export type SessionEvent =
  | SessionCreatedEvent
  | SessionStartedEvent
  | SessionPausedEvent
  | SessionResumedEvent
  | SessionEndedEvent
  | SessionArchivedEvent
