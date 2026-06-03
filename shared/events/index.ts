/**
 * Event Types Index
 * Export all event types used across the system.
 */

export * from './base'
export * from './chat'
export * from './session'
export * from './room'
export * from './presence'
export * from './notes'
export * from './audio'
export * from './campaign'

export type AnyEvent =
  | import('./chat').ChatEvent
  | import('./session').SessionEvent
  | import('./room').RoomEvent
  | import('./presence').PresenceEvent
  | import('./notes').NotesEvent
  | import('./audio').AudioEvent
  | import('./campaign').CampaignEvent
