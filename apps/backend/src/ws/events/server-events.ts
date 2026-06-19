/**
 * Server Event Types
 * Defines the set of event types that the server originates and broadcasts to clients.
 * These include session lifecycle changes triggered via REST, system-generated notifications,
 * and any event the server re-broadcasts after processing a client-originated event.
 *
 * Client-originated event types are defined in client-events.ts.
 */

/**
 * Session lifecycle events — server broadcasts to all session participants.
 * Triggered by DM REST actions; the server emits these over WS after state transitions.
 */
export const SERVER_SESSION_EVENT_TYPES = [
  'SESSION:CREATED',
  'SESSION:STARTED',
  'SESSION:PAUSED',
  'SESSION:RESUMED',
  'SESSION:COOLDOWN_STARTED',
  'SESSION:COOLDOWN_EXTENDED',
  'SESSION:COOLDOWN_ENDED',
  'SESSION:ENDED',
  'SESSION:ARCHIVED',
  'SESSION:DEVICE_SESSION_CONNECTED',
  'SESSION:DEVICE_SESSION_DISCONNECTED',
  'SESSION:DEVICE_SESSION_TRANSFERRED',
  'SESSION:DEVICE_MIC_OWNER_CHANGED',
  'SESSION:DEVICE_MIC_HARD_UNPUBLISHED',
] as const

/**
 * Room events the server may emit (e.g. after a bulk session transition).
 */
export const SERVER_ROOM_EVENT_TYPES = [
  'ROOM:CREATED',
  'ROOM:DELETED',
  'ROOM:SESSION_TRANSITION_APPLIED',
] as const

/**
 * Presence events the server may emit (e.g. reconnection detection).
 */
export const SERVER_PRESENCE_EVENT_TYPES = ['PRESENCE:RECONNECTED'] as const

/**
 * Chat broadcast events the server re-emits to room members.
 */
export const SERVER_CHAT_EVENT_TYPES = [
  'CHAT:MESSAGE_SENT',
  'CHAT:MESSAGE_EDITED',
  'CHAT:MESSAGE_DELETED',
  'CHAT:TYPING_STARTED',
  'CHAT:TYPING_STOPPED',
] as const

/**
 * Notes broadcast events the server re-emits.
 */
export const SERVER_NOTES_EVENT_TYPES = [
  'NOTES:CREATED',
  'NOTES:UPDATED',
  'NOTES:DELETED',
  'NOTES:SHARED',
  'NOTES:TAG_ADDED',
] as const

/**
 * Audio broadcast events the server re-emits to session members.
 */
export const SERVER_AUDIO_EVENT_TYPES = [
  'AUDIO:EFFECT_APPLIED',
  'AUDIO:EFFECT_REMOVED',
  'AUDIO:PRESET_LOADED',
  'AUDIO:ENVIRONMENT_SET',
  'AUDIO:DM_OVERRIDE_APPLIED',
  'AUDIO:DM_OVERRIDE_REMOVED',
] as const

/**
 * Campaign-scoped events broadcast via broadcastToCampaignMembers (not session-scoped).
 * Delivered to all campaign members regardless of active session state.
 */
export const SERVER_CAMPAIGN_EVENT_TYPES = [
  'CAMPAIGN:JOIN_REQUEST_RECEIVED',
  'CAMPAIGN:JOIN_REQUEST_RESOLVED',
  'CAMPAIGN:RETIRED',
  'CAMPAIGN:RESUMED',
  'CAMPAIGN:LOBBY_STATS_UPDATED',
  'CAMPAIGN:LIST_INVALIDATED',
  'CAMPAIGN:PARTY_PRESENCE_UPDATED',
  'CAMPAIGN:DM_TRANSFER_INITIATED',
  'CAMPAIGN:DM_TRANSFER_RESPONDED',
  'CAMPAIGN:DM_TRANSFER_CANCELLED',
  'CAMPAIGN:DM_TRANSFERRED',
  'CAMPAIGN:SCHEDULE_UPDATED',
] as const

/**
 * Full set of event type strings that the server may send to clients.
 */
export const SERVER_EVENT_TYPES = [
  ...SERVER_SESSION_EVENT_TYPES,
  ...SERVER_ROOM_EVENT_TYPES,
  ...SERVER_PRESENCE_EVENT_TYPES,
  ...SERVER_CHAT_EVENT_TYPES,
  ...SERVER_NOTES_EVENT_TYPES,
  ...SERVER_AUDIO_EVENT_TYPES,
  ...SERVER_CAMPAIGN_EVENT_TYPES,
] as const

export type ServerEventType = (typeof SERVER_EVENT_TYPES)[number]

/**
 * Returns true if the given string is a recognised server-originating event type.
 */
export function isServerEventType(type: string): type is ServerEventType {
  return (SERVER_EVENT_TYPES as readonly string[]).includes(type)
}
