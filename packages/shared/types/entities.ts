import type {
  DeviceClass,
  MessageType,
  NoteVisibility,
  PresenceState,
  Role,
  RoomType,
  SessionLifecycleState,
  UUID,
} from './index'

/**
 * Canonical cross-system entity contracts.
 *
 * These are intentionally permissive enough for backend persistence models,
 * frontend view models, and admin DTOs to align on a shared base shape.
 */

export interface DeviceSessionEntity {
  deviceSessionId: string
  deviceClass: DeviceClass
  label: string
  connectedAt: number
  isActive: boolean
  isMuted: boolean
}

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
  state: SessionLifecycleState
  description?: string
  plannedDurationMinutes?: number
  cumulativePauseMs: number
  pauseCount: number
  pauseStartedAt?: number
  createdAt: number
  startedAt?: number
  pausedAt?: number
  endedAt?: number
  cooldownExpiresAt?: number
  updatedAt?: number
  cooldownExtensionCount?: number
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

export interface NoteSharedMessageMetadata {
  kind: 'NOTE_SHARED'
  noteId: UUID
  title: string
  markdown: string
  sharedWith: string
  hashtags: string
}

export interface NoteHandoutMessageMetadata {
  kind: 'NOTE_HANDOUT'
  noteId: UUID
  title: string
  excerpt: string
  excerptSource: 'AUTO' | 'MANUAL'
  /** Full note content — present on messages created after this field was added. */
  fullContent?: string
}

export interface ConditionMessageMetadata {
  kind: 'CONDITION'
  targetUserId: UUID
  presetName?: string
  isRemoval: boolean
  overrideType?: 'CONDITION' | 'DISTANCE'
}

export interface MessageMetadataEntity {
  noteShared?: NoteSharedMessageMetadata
  noteHandout?: NoteHandoutMessageMetadata
  conditionMessage?: ConditionMessageMetadata
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
  isOffTheRecord?: boolean
  visibleTo?: UUID[]
  targetIds?: UUID[]
  metadata?: MessageMetadataEntity
  createdAt: number
  editedAt?: number
}

export interface NoteEntity {
  id: UUID
  campaignId?: UUID
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
  attachments?: NoteAttachmentEntity[]
  publishedAt?: number
  createdAt: number
  updatedAt: number
}

export interface NoteAttachmentEntity {
  id: UUID
  campaignId?: UUID
  mime: string
  name: string
  uri: string
  createdAt: number
}

export interface PresenceEntity {
  userId: UUID
  username: string
  role?: Role
  playerName?: string
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  state: PresenceState
  ghost?: boolean
  userMuted?: boolean
  primaryRoomId?: UUID
  previousGroupId?: UUID
  privateRoomId?: UUID
  deviceSessions?: DeviceSessionEntity[]
  lastSeenAt: number
}
