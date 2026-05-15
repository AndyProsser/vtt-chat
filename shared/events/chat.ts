/**
 * Chat System Events
 * Reference: docs/subsystems/CHAT-SYSTEM.md
 *
 * Chat events are room-scoped and role-filtered.
 * Privacy: OOC/IC public to room, Whispers DM-visible only, System messages filtered.
 */

import type { UUID, MessageType } from '../types'
import type { EventEnvelope } from './base'

export type ChatEventType =
  | 'CHAT:MESSAGE_SENT'
  | 'CHAT:MESSAGE_EDITED'
  | 'CHAT:MESSAGE_DELETED'
  | 'CHAT:ROOM_CONTEXT_CLEARED'
  | 'CHAT:TYPING_STARTED'
  | 'CHAT:TYPING_STOPPED'

/**
 * CHAT:MESSAGE_SENT
 * User sends a message (IC, OOC, whisper, or system).
 * Visibility: Role-filtered by type (whispers visible to DM + recipients only).
 */
export interface ChatMessageSent {
  messageId: UUID
  roomId?: UUID
  authorId: UUID
  authorUsername: string
  content: string
  type: MessageType
  isDmOnly: boolean
  isOffTheRecord?: boolean
  /** If WHISPER: array of user IDs who can see this */
  visibleTo?: UUID[]
  /** If WHISPER: explicit target user IDs */
  targetIds?: UUID[]
}

export type ChatMessageSentEvent = EventEnvelope<ChatMessageSent>

/**
 * CHAT:MESSAGE_EDITED
 * User edits a message (must be author or DM).
 * Visibility: Same as original message.
 */
export interface ChatMessageEdited {
  messageId: UUID
  authorId: UUID
  previousContent: string
  newContent: string
  editedAt: number
}

export type ChatMessageEditedEvent = EventEnvelope<ChatMessageEdited>

/**
 * CHAT:MESSAGE_DELETED
 * User deletes a message (must be author or DM).
 * Visibility: DM-visible, players see removal notification only.
 */
export interface ChatMessageDeleted {
  messageId: UUID
  authorId: UUID
  deletedBy: UUID
  deletedAt: number
  reason?: string
}

export type ChatMessageDeletedEvent = EventEnvelope<ChatMessageDeleted>

/**
 * CHAT:ROOM_CONTEXT_CLEARED
 * Live context for a specific room was reset (for example when returning to Greenroom).
 */
export interface ChatRoomContextCleared {
  roomId: UUID
  reason?: string
}

export type ChatRoomContextClearedEvent = EventEnvelope<ChatRoomContextCleared>

/**
 * CHAT:TYPING_STARTED
 * User started typing. Ephemeral, does not persist.
 * Visibility: Room members only (filtered by role).
 */
export interface ChatTypingStarted {
  userId: UUID
  username: string
  roomId?: UUID
  startedAt?: number
}

export type ChatTypingStartedEvent = EventEnvelope<ChatTypingStarted>

/**
 * CHAT:TYPING_STOPPED
 * User stopped typing. Ephemeral.
 */
export interface ChatTypingStopped {
  userId: UUID
  username?: string
  roomId?: UUID
  stoppedAt?: number
}

export type ChatTypingStoppedEvent = EventEnvelope<ChatTypingStopped>

/**
 * Union type for all chat events.
 */
export type ChatEvent =
  | ChatMessageSentEvent
  | ChatMessageEditedEvent
  | ChatMessageDeletedEvent
  | ChatRoomContextClearedEvent
  | ChatTypingStartedEvent
  | ChatTypingStoppedEvent
