import type {
  MessageType,
  NoteVisibility,
  PresenceState,
  Role,
  RoomType,
  SessionState,
  UUID,
} from './index'

/**
 * Canonical cross-system entity contracts.
 *
 * These are intentionally permissive enough for backend persistence models,
 * frontend view models, and admin DTOs to align on a shared base shape.
 */

export interface UserEntity {
  id: UUID
  username: string
  role: Role
  createdAt?: number
  displayName?: string
}

export interface SessionEntity {
  id: UUID
  name: string
  dmId: UUID
  state: SessionState
  description?: string
  createdAt: number
  startedAt?: number
  pausedAt?: number
  endedAt?: number
  updatedAt?: number
}

export interface RoomEntity {
  id: UUID
  sessionId: UUID
  name: string
  type: RoomType
  createdAt: number
  createdBy?: UUID
  updatedAt?: number
}

export interface MessageEntity {
  id: UUID
  sessionId?: UUID
  roomId?: UUID
  authorId: UUID
  authorUsername?: string
  content: string
  type: MessageType
  isDmOnly?: boolean
  visibleTo?: UUID[]
  createdAt: number
  editedAt?: number
}

export interface NoteEntity {
  id: UUID
  sessionId?: UUID
  authorId?: UUID
  ownerId?: UUID
  authorUsername?: string
  ownerUsername?: string
  title: string
  content: string
  visibility: NoteVisibility
  tags: string[]
  allowedUsers?: UUID[]
  publishedAt?: number
  createdAt: number
  updatedAt: number
}

export interface PresenceEntity {
  userId: UUID
  username: string
  state: PresenceState
  primaryRoomId?: UUID
  privateRoomId?: UUID
  lastSeenAt: number
}
