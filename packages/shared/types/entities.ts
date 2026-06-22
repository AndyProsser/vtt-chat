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
  /** Distinguishes audio condition presets from distance presets. Absent in legacy messages. */
  overrideType?: 'CONDITION' | 'DISTANCE'
}

/** Stored when a /roll command is resolved server-side. */
export interface RollResultMessageMetadata {
  kind: 'ROLL_RESULT'
  /** Original dice expression as typed, e.g. "2d6+3" or "ADVd20+5" */
  expression: string
  /** Individual die results in roll order (always 2 for ADV/DIS) */
  rolls: number[]
  /** For ADV/DIS: index into rolls[] that was kept to compute the total */
  keptIndex?: number
  /** Modifier value (positive or negative), 0 if absent */
  modifier: number
  /** Final result: kept die (ADV/DIS) or sum of all dice, plus modifier */
  total: number
  /** Set when an advantage or disadvantage roll was used */
  advantage?: 'ADV' | 'DIS'
}

export interface LootSplitCardMetadata {
  splitId: string
  itemName: string
  totalQuantity: number
  shareQuantity: number
  shares: Array<{ userId: string; quantity: number }>
  /** Items left in party after floor-division split. */
  remainder: number
  appliedAt: number
  proposedByUserId: string
}

export interface MessageMetadataEntity {
  noteShared?: NoteSharedMessageMetadata
  noteHandout?: NoteHandoutMessageMetadata
  conditionMessage?: ConditionMessageMetadata
  rollResult?: RollResultMessageMetadata
  lootSplitCard?: LootSplitCardMetadata
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

/** A single class entry for a character; name is the merged "ClassName / SubclassName" string. */
export interface CharacterClassEntry {
  name: string
  level: number
}

export interface PresenceEntity {
  userId: UUID
  username: string
  role?: Role
  playerName?: string
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
  /** @deprecated Merged into characterClass and characterClasses. Kept for legacy WS payloads only. */
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  /** Full class array. Single-element for non-multiclassed characters. */
  characterClasses?: CharacterClassEntry[] | null
  multiclass?: boolean | null
  state: PresenceState
  ghost?: boolean
  userMuted?: boolean
  primaryRoomId?: UUID
  previousGroupId?: UUID
  privateRoomId?: UUID
  deviceSessions?: DeviceSessionEntity[]
  lastSeenAt: number
}
