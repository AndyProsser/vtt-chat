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
  COOLDOWN = 'COOLDOWN',
  ENDED = 'ENDED',
  CLEANUP = 'CLEANUP',
}

export type SessionLifecycleState = SessionState

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
  DM = 'DM',
  SYSTEM = 'SYSTEM',
  ROLL = 'ROLL',
}

export enum PresenceState {
  ONLINE = 'ONLINE',
  TYPING = 'TYPING',
  SPEAKING = 'SPEAKING',
  IDLE = 'IDLE',
  OFFLINE = 'OFFLINE',
}

export enum DeviceClass {
  DESKTOP = 'DESKTOP',
  MOBILE = 'MOBILE',
  TABLET = 'TABLET',
}

// ---------------------------------------------------------------------------
// Connection status canonical model
// Used by frontend, backend, and admin to refer to the same state keys.
// ---------------------------------------------------------------------------

export enum CoreWsState {
  CONNECTED = 'CONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR',
}

export enum LiveKitConnectionState {
  CONNECTED = 'CONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum StatusContext {
  OUTSIDE_CAMPAIGN = 'OUTSIDE_CAMPAIGN',
  INSIDE_CAMPAIGN = 'INSIDE_CAMPAIGN',
}

export enum StatusIconState {
  OK = 'OK',
  OK_PARTIAL = 'OK_PARTIAL',
  CONNECTING = 'CONNECTING',
  DEGRADED_AUDIO = 'DEGRADED_AUDIO',
  ERROR = 'ERROR',
}

export enum StatusColorKey {
  GREEN = 'GREEN',
  PALE_GREEN = 'PALE_GREEN',
  YELLOW = 'YELLOW',
  ORANGE = 'ORANGE',
  RED = 'RED',
}

export enum SessionScheduleType {
  WEEKLY = 'WEEKLY',
  BIWEEKLY = 'BIWEEKLY',
  MONTHLY_NTH = 'MONTHLY_NTH',
}

export enum InventoryItemSource {
  SRD = 'SRD',
  CUSTOM = 'CUSTOM',
}

export enum InventoryOwnerType {
  PARTY = 'party',
  CHARACTER = 'character',
}

export enum InventoryActionType {
  ITEM_ADDED = 'ITEM_ADDED',
  ITEM_REMOVED = 'ITEM_REMOVED',
  ITEM_TRANSFERRED = 'ITEM_TRANSFERRED',
  ITEM_EDITED = 'ITEM_EDITED',
  CURRENCY_CHANGED = 'CURRENCY_CHANGED',
}

/** GP/SP/CP/EP/PP wallet amounts. All values are non-negative integers. */
export interface CurrencyWallet {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
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
  description?: string
  plannedDurationMinutes?: number
  cumulativePauseMs?: number
  pauseCount?: number
  pauseStartedAt?: number
  dmId: UUID
  state: SessionLifecycleState
  createdAt: number
  startedAt?: number
  endedAt?: number
  cooldownExpiresAt?: number
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

export type {
  ConditionMessageMetadata,
  DeviceSessionEntity,
  MessageMetadataEntity,
  UserEntity,
  SessionEntity,
  RoomEntity,
  MessageEntity,
  NoteEntity,
  NoteAttachmentEntity,
  NoteSharedMessageMetadata,
  PresenceEntity,
  RollResultMessageMetadata,
} from './entities'
