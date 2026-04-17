/**
 * Shared Types Index
 * Export all core types used across backend, frontend, and admin.
 */

export type UUID = string & { readonly __uuid: unique symbol }

export enum Role {
  DM = 'DM',
  PLAYER = 'PLAYER',
  SPECTATOR = 'SPECTATOR',
  SYSTEM = 'SYSTEM',
}

export enum SessionState {
  IDLE = 'IDLE',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
}

export enum RoomType {
  MAIN = 'MAIN',
  GROUP = 'GROUP',
  PRIVATE = 'PRIVATE',
}

export enum NoteVisibility {
  DM_ONLY = 'DM_ONLY',
  PLAYERS_VISIBLE = 'PLAYERS_VISIBLE',
  CUSTOM = 'CUSTOM',
}

export enum MessageType {
  IC = 'IC',
  OOC = 'OOC',
  WHISPER = 'WHISPER',
  SYSTEM = 'SYSTEM',
}

export enum PresenceState {
  ONLINE = 'ONLINE',
  TYPING = 'TYPING',
  SPEAKING = 'SPEAKING',
  IDLE = 'IDLE',
  OFFLINE = 'OFFLINE',
}

/**
 * Core Domain Objects (contracts, not full models)
 */

export interface User {
  id: UUID
  username: string
  role: Role
  createdAt: number // Unix timestamp
}

export interface Session {
  id: UUID
  name: string
  dmId: UUID
  state: SessionState
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
