/**
 * Room and Presence Events
 * Reference: docs/subsystems/PRESENCE-STATE-MACHINE.md
 *
 * Room events manage membership and transitions.
 * Presence events track user state: online, typing, speaking, idle.
 * Both are role-filtered for visibility.
 */
import type { UUID, PresenceState } from '../types';
import type { EventEnvelope } from './base';
export type RoomEventType = 'ROOM:CREATED' | 'ROOM:USER_JOINED' | 'ROOM:USER_LEFT' | 'ROOM:DELETED';
export type PresenceEventType = 'PRESENCE:STATE_CHANGED' | 'PRESENCE:HEARTBEAT' | 'PRESENCE:RECONNECTED';
/**
 * ROOM:CREATED
 * DM creates a new room within the session.
 * Visibility: All session participants see room creation.
 */
export interface RoomCreated {
    roomId: UUID;
    roomName: string;
    roomType: 'MAIN' | 'GROUP' | 'PRIVATE';
    createdAt: number;
    /** If PRIVATE: array of user IDs invited */
    members?: UUID[];
}
export type RoomCreatedEvent = EventEnvelope<RoomCreated>;
/**
 * ROOM:USER_JOINED
 * User joins a room.
 * Generates a system message: "Alice has joined the room".
 * Visibility: All room members see this.
 */
export interface RoomUserJoined {
    roomId: UUID;
    userId: UUID;
    username: string;
    joinedAt: number;
}
export type RoomUserJoinedEvent = EventEnvelope<RoomUserJoined>;
/**
 * ROOM:USER_LEFT
 * User leaves a room (disconnect or voluntary).
 * Generates a system message: "Bob has left the room".
 * Visibility: All room members see this.
 */
export interface RoomUserLeft {
    roomId: UUID;
    userId: UUID;
    username: string;
    leftAt: number;
    reason?: 'DISCONNECT' | 'VOLUNTARY' | 'KICKED';
}
export type RoomUserLeftEvent = EventEnvelope<RoomUserLeft>;
/**
 * ROOM:DELETED
 * DM deletes a room (private cleanup or archival).
 * Visibility: DM-visible operation.
 */
export interface RoomDeleted {
    roomId: UUID;
    deletedAt: number;
    deletedBy: UUID;
}
export type RoomDeletedEvent = EventEnvelope<RoomDeleted>;
/**
 * PRESENCE:STATE_CHANGED
 * User presence state changed: ONLINE, TYPING, SPEAKING, IDLE, OFFLINE.
 * Ephem eral, updates every state change.
 * Visibility: Role-filtered (spectators see minimal presence).
 */
export interface PresenceStateChanged {
    userId: UUID;
    username: string;
    previousState: PresenceState;
    newState: PresenceState;
    changedAt: number;
}
export type PresenceStateChangedEvent = EventEnvelope<PresenceStateChanged>;
/**
 * PRESENCE:HEARTBEAT
 * Ephemeral keepalive to maintain presence state.
 * Sent periodically to detect stale connections.
 * Visibility: Internal, not sent to clients.
 */
export interface PresenceHeartbeat {
    userId: UUID;
    roomId: UUID | null;
    state: PresenceState;
    beatsAt: number;
}
export type PresenceHeartbeatEvent = EventEnvelope<PresenceHeartbeat>;
/**
 * PRESENCE:RECONNECTED
 * User reconnected after disconnect.
 * Restores previous presence state.
 * Visibility: Room members see reconnect event.
 */
export interface PresenceReconnected {
    userId: UUID;
    username: string;
    reconnectedAt: number;
    previousState: PresenceState;
    restoredState: PresenceState;
}
export type PresenceReconnectedEvent = EventEnvelope<PresenceReconnected>;
/**
 * Union types.
 */
export type RoomEvent = RoomCreatedEvent | RoomUserJoinedEvent | RoomUserLeftEvent | RoomDeletedEvent;
export type PresenceEvent = PresenceStateChangedEvent | PresenceHeartbeatEvent | PresenceReconnectedEvent;
