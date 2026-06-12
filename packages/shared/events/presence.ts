/**
 * Presence Events
 * Reference: docs/subsystems/PRESENCE-STATE-MACHINE.md
 *
 * Presence events track per-user transient state: online, typing, speaking, idle, offline.
 * All events are role-filtered; spectators see a minimal projection.
 */

import type { UUID, PresenceState } from '../types'
import type { EventEnvelope } from './base'

export type PresenceEventType =
  | 'PRESENCE:STATE_CHANGED'
  | 'PRESENCE:USER_GHOST_MODE_CHANGED'
  | 'PRESENCE:PROFILE_UPDATED'
  | 'PRESENCE:HEARTBEAT'
  | 'PRESENCE:RECONNECTED'

/**
 * PRESENCE:STATE_CHANGED
 * User presence state changed: ONLINE, TYPING, SPEAKING, IDLE, OFFLINE.
 * Ephemeral; updates on every state change.
 * Visibility: Role-filtered (spectators see minimal presence).
 */
export interface PresenceStateChanged {
  userId: UUID
  username: string
  previousState: PresenceState
  newState: PresenceState
  changedAt: number
  previousGroupId?: UUID | null
}

export type PresenceStateChangedEvent = EventEnvelope<PresenceStateChanged>

/**
 * PRESENCE:USER_GHOST_MODE_CHANGED
 * User ghost-mode projection changed.
 * Ghost = disconnected but preserving session presence (within TTL window).
 * Visibility: All session members receive this projection update.
 */
export interface PresenceUserGhostModeChanged {
  userId: UUID
  username: string
  roomId: UUID | null
  ghostMode: boolean
  changedAt: number
  previousGroupId?: UUID | null
}

export type PresenceUserGhostModeChangedEvent = EventEnvelope<PresenceUserGhostModeChanged>

/**
 * PRESENCE:PROFILE_UPDATED
 * User profile or character metadata changed while remaining in session.
 * Visibility: Room members and session participants see updated profile fields immediately.
 */
export interface PresenceProfileUpdated {
  userId: UUID
  username: string
  updatedAt: number
  roomId?: UUID | null
  previousGroupId?: UUID | null
  playerName?: string | null
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
}

export type PresenceProfileUpdatedEvent = EventEnvelope<PresenceProfileUpdated>

/**
 * PRESENCE:HEARTBEAT
 * Ephemeral keepalive to maintain presence state.
 * Sent periodically to detect stale connections.
 * Visibility: Internal — not forwarded to clients.
 */
export interface PresenceHeartbeat {
  userId: UUID
  roomId: UUID | null
  state: PresenceState
  beatsAt: number
}

export type PresenceHeartbeatEvent = EventEnvelope<PresenceHeartbeat>

/**
 * PRESENCE:RECONNECTED
 * User reconnected after a disconnect within the ghost window.
 * Restores previous presence state.
 * Visibility: Room members see the reconnect event.
 */
export interface PresenceReconnected {
  userId: UUID
  username: string
  reconnectedAt: number
  previousState: PresenceState
  restoredState: PresenceState
}

export type PresenceReconnectedEvent = EventEnvelope<PresenceReconnected>

/**
 * Union of all presence events.
 */
export type PresenceEvent =
  | PresenceStateChangedEvent
  | PresenceUserGhostModeChangedEvent
  | PresenceProfileUpdatedEvent
  | PresenceHeartbeatEvent
  | PresenceReconnectedEvent
