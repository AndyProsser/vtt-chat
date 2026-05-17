/**
 * Session Lifecycle Events
 * Reference: docs/architecture/SESSION-LIFECYCLE.md
 *
 * Session events control the state machine: idle → active → paused → ended.
 * Only DM can transition session state.
 * Visibility: All state changes are visible to all session participants.
 */

import type { UUID } from '../types'
import type { EventEnvelope } from './base'

export type SessionEventType =
  | 'SESSION:CREATED'
  | 'SESSION:STARTED'
  | 'SESSION:PAUSED'
  | 'SESSION:RESUMED'
  | 'SESSION:COOLDOWN_STARTED'
  | 'SESSION:ENDED'
  | 'SESSION:ARCHIVED'
  | 'SESSION:STATS_UPDATED'
  | 'SESSION:COOLDOWN_EXTENDED'
  | 'SESSION:COOLDOWN_ENDED'

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
 * SESSION:COOLDOWN_STARTED
 * DM ends the session, entering the post-game cooldown window (ACTIVE/PAUSED → COOLDOWN).
 * OOC chat is enabled; DM audio effects are frozen; no group changes allowed.
 * Topbar shows cooldown countdown timer.
 */
export interface SessionCooldownStarted {
  sessionId: UUID
  dmId: UUID
  cooldownStartedAt: number
  /** Timestamp when the cooldown will auto-expire and transition to ENDED. */
  cooldownExpiresAt: number
}

export type SessionCooldownStartedEvent = EventEnvelope<SessionCooldownStarted>

/**
 * SESSION:ENDED
 * Cooldown has expired; the session is now archive-locked (COOLDOWN → ENDED).
 * No new activities are possible. Session remains in ENDED until all participants disconnect.
 */
export interface SessionEnded {
  sessionId: UUID
  endedAt: number
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
 * SESSION:STATS_UPDATED
 * Backend-authoritative connected participant counters for a session.
 * Broadcast whenever presence/membership changes affect live counts.
 */
export interface SessionStatsUpdated {
  connectedPlayersWithDm: number
  connectedPlayers: number
  connectedSpectators: number
  connectedTotal: number
  updatedAt: number
}

export type SessionStatsUpdatedEvent = EventEnvelope<SessionStatsUpdated>

/**
 * SESSION:COOLDOWN_EXTENDED
 * DM extended the post-session cooldown window.
 */
export interface SessionCooldownExtended {
  sessionId: UUID
  state: string
  extensionMs: number
  previousEndedAt: number | null
  endedAt: number | null
  extensionCount?: number
}

export type SessionCooldownExtendedEvent = EventEnvelope<SessionCooldownExtended>

/**
 * SESSION:COOLDOWN_ENDED
 * DM ended the post-session cooldown window early.
 * All clients should treat the session as finalized.
 */
export interface SessionCooldownEnded {
  sessionId: UUID
  state: string
  endedBy: UUID
  endedAt: number
}

export type SessionCooldownEndedEvent = EventEnvelope<SessionCooldownEnded>

/**
 * Union type for all session events.
 */
export type SessionEvent =
  | SessionCreatedEvent
  | SessionStartedEvent
  | SessionPausedEvent
  | SessionResumedEvent
  | SessionCooldownStartedEvent
  | SessionEndedEvent
  | SessionArchivedEvent
  | SessionStatsUpdatedEvent
  | SessionCooldownExtendedEvent
  | SessionCooldownEndedEvent
