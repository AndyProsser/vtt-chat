/**
 * Client Event Types
 * Defines the set of event types that WebSocket clients may originate and send to the server.
 * Used by the dispatcher to validate inbound event direction.
 *
 * Server-originated events (broadcasts, system notifications) are defined in server-events.ts.
 */

/**
 * Auth handshake — sent by the client immediately after connection.
 * Must arrive within AUTH_TIMEOUT_MS or the connection is closed.
 */
export const WS_AUTH_EVENT = 'WS:AUTH' as const

/**
 * Chat events clients may send.
 */
export const CLIENT_CHAT_EVENT_TYPES = [
  'CHAT:MESSAGE_SENT',
  'CHAT:MESSAGE_EDITED',
  'CHAT:MESSAGE_DELETED',
  'CHAT:TYPING_STARTED',
  'CHAT:TYPING_STOPPED',
] as const

/**
 * Room events clients may send.
 */
export const CLIENT_ROOM_EVENT_TYPES = [
  'ROOM:CREATED',
  'ROOM:USER_JOINED',
  'ROOM:USER_LEFT',
] as const

/**
 * Presence events clients may send.
 */
export const CLIENT_PRESENCE_EVENT_TYPES = ['PRESENCE:STATE_CHANGED', 'PRESENCE:HEARTBEAT'] as const

/**
 * Notes events clients may send.
 */
export const CLIENT_NOTES_EVENT_TYPES = [
  'NOTES:CREATED',
  'NOTES:UPDATED',
  'NOTES:DELETED',
  'NOTES:SHARED',
  'NOTES:TAG_ADDED',
] as const

/**
 * Audio events clients may send (DM-gated; permission enforced by dispatcher).
 */
export const CLIENT_AUDIO_EVENT_TYPES = [
  'AUDIO:EFFECT_APPLIED',
  'AUDIO:EFFECT_REMOVED',
  'AUDIO:PRESET_LOADED',
  'AUDIO:ENVIRONMENT_SET',
  'AUDIO:DM_OVERRIDE_APPLIED',
  'AUDIO:DM_OVERRIDE_REMOVED',
] as const

/**
 * Full set of event type strings that a client may send over the WebSocket connection.
 */
export const CLIENT_EVENT_TYPES = [
  ...CLIENT_CHAT_EVENT_TYPES,
  ...CLIENT_ROOM_EVENT_TYPES,
  ...CLIENT_PRESENCE_EVENT_TYPES,
  ...CLIENT_NOTES_EVENT_TYPES,
  ...CLIENT_AUDIO_EVENT_TYPES,
] as const

export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number]

/**
 * Returns true if the given string is a recognised client-originating event type.
 */
export function isClientEventType(type: string): type is ClientEventType {
  return (CLIENT_EVENT_TYPES as readonly string[]).includes(type)
}
