/**
 * Room Events
 * Reference: docs/architecture/WEBSOCKETS.md
 *
 * Room events manage membership, creation, deletion, and bulk session transitions.
 * Visibility: All session participants unless noted.
 */

import type { UUID, PresenceState, SessionLifecycleState } from '../types'
import type { EventEnvelope } from './base'

export type RoomEventType =
  | 'ROOM:CREATED'
  | 'ROOM:USER_JOINED'
  | 'ROOM:USER_LEFT'
  | 'ROOM:DELETED'
  | 'ROOM:SESSION_TRANSITION_APPLIED'

/**
 * ROOM:CREATED
 * DM creates a new room within the session.
 * Visibility: All session participants see room creation.
 */
export interface RoomCreated {
  roomId: UUID
  roomName: string
  roomType: 'MAIN' | 'GROUP' | 'PRIVATE'
  createdAt: number
  /** If PRIVATE: array of user IDs invited */
  members?: UUID[]
}

export type RoomCreatedEvent = EventEnvelope<RoomCreated>

/**
 * ROOM:USER_JOINED
 * User joins a room (room-membership change, not session entry).
 * For session-level entry with full profile data, see SESSION:MEMBER_JOINED.
 * Visibility: All room members see this.
 */
export interface RoomUserJoined {
  roomId: UUID
  userId: UUID
  username: string
  joinedAt: number
}

export type RoomUserJoinedEvent = EventEnvelope<RoomUserJoined>

/**
 * ROOM:USER_LEFT
 * User leaves a room (room-membership change, not full session departure).
 * For full session departure, see SESSION:MEMBER_LEFT.
 * Visibility: All room members see this.
 */
export interface RoomUserLeft {
  roomId: UUID
  userId: UUID
  username: string
  leftAt: number
  reason?: 'VOLUNTARY' | 'KICKED'
}

export type RoomUserLeftEvent = EventEnvelope<RoomUserLeft>

/**
 * ROOM:DELETED
 * DM deletes a room (private cleanup or explicit deletion).
 * Visibility: DM-visible operation; affected members receive ROOM:USER_LEFT first.
 */
export interface RoomDeleted {
  roomId: UUID
  deletedAt: number
  deletedBy: UUID
}

export type RoomDeletedEvent = EventEnvelope<RoomDeleted>

/**
 * ROOM:SESSION_TRANSITION_APPLIED
 * Server-originated event after bulk session room transition orchestration.
 * Moves all users to the appropriate room for the new session state.
 */
export interface RoomSessionTransitionApplied {
  previousState: SessionLifecycleState | null
  nextState: SessionLifecycleState
  movedUsers: number
  targetState: PresenceState
  mainRoom: {
    id: UUID
    name: string
    roomType: 'MAIN'
  }
  greenRoom: {
    id: UUID
    name: string
    roomType: 'GROUP'
  }
  targetRoomId: UUID
  targetRoomName: string
  users: Array<{
    userId: UUID
    username: string
    roomId?: UUID
    roomName?: string
    previousGroupId?: UUID | null
  }>
}

export type RoomSessionTransitionAppliedEvent = EventEnvelope<RoomSessionTransitionApplied>

/**
 * Union of all room events.
 */
export type RoomEvent =
  | RoomCreatedEvent
  | RoomUserJoinedEvent
  | RoomUserLeftEvent
  | RoomDeletedEvent
  | RoomSessionTransitionAppliedEvent
