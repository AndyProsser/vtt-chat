/**
 * Shared Types Index
 * Export all core types used across backend, frontend, and admin.
 */
export type UUID = string & {
  readonly __uuid: unique symbol
}
export declare enum Role {
  DM = 'DM',
  PLAYER = 'PLAYER',
  SPECTATOR = 'SPECTATOR',
  SYSTEM = 'SYSTEM',
}
export declare enum SessionState {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
  CLEANUP = 'CLEANUP',
}
export type SessionLifecycleState = SessionState | 'INACTIVE'
export declare enum RoomType {
  MAIN = 'MAIN',
  GROUP = 'GROUP',
  PRIVATE = 'PRIVATE',
}
export declare enum NoteVisibility {
  DM_ONLY = 'DM_ONLY',
  PLAYERS_VISIBLE = 'PLAYERS_VISIBLE',
  CUSTOM = 'CUSTOM',
}
export declare enum MessageType {
  IC = 'IC',
  OOC = 'OOC',
  WHISPER = 'WHISPER',
  SYSTEM = 'SYSTEM',
}
export declare enum PresenceState {
  ONLINE = 'ONLINE',
  TYPING = 'TYPING',
  SPEAKING = 'SPEAKING',
  IDLE = 'IDLE',
  OFFLINE = 'OFFLINE',
}
export declare enum CoreWsState {
  CONNECTED = 'CONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR',
}
export declare enum LiveKitConnectionState {
  CONNECTED = 'CONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}
export declare enum StatusContext {
  OUTSIDE_CAMPAIGN = 'OUTSIDE_CAMPAIGN',
  INSIDE_CAMPAIGN = 'INSIDE_CAMPAIGN',
}
export declare enum StatusIconState {
  OK = 'OK',
  OK_PARTIAL = 'OK_PARTIAL',
  CONNECTING = 'CONNECTING',
  DEGRADED_AUDIO = 'DEGRADED_AUDIO',
  ERROR = 'ERROR',
}
export declare enum StatusColorKey {
  GREEN = 'GREEN',
  PALE_GREEN = 'PALE_GREEN',
  YELLOW = 'YELLOW',
  ORANGE = 'ORANGE',
  RED = 'RED',
}
/**
 * Core Domain Objects (contracts, not full models)
 */
export interface User {
  id: UUID
  username: string
  role: Role
  createdAt: number
}
export interface Session {
  id: UUID
  name: string
  dmId: UUID
  state: SessionLifecycleState
  createdAt: number
  startedAt?: number
  endedAt?: number
}
export interface Room {
  id: UUID
  sessionId: UUID
  name: string
  type: RoomType
  createdAt: number
}
export interface Message {
  id: UUID
  sessionId: UUID
  roomId: UUID
  authorId: UUID
  content: string
  type: MessageType
  createdAt: number
}
export interface Note {
  id: UUID
  sessionId: UUID
  title: string
  content: string
  authorId: UUID
  visibility: NoteVisibility
  createdAt: number
  updatedAt: number
}
export interface Metadata {
  id: UUID
  sessionId: UUID
  roomId: UUID
  type: string
  title: string
  description?: string
  tags: string[]
  createdAt: number
  updatedAt: number
}
