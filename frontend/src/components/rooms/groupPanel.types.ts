import type { UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'

export interface GroupPanelGroup {
  id: UUID
  name: string
  type: RoomType
  memberCount: number
  environmentName?: string
}

export interface GroupParticipantStatus {
  userId: UUID
  username: string
  avatarUrl?: string | null
  characterName?: string | null
  playerName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  presenceState: PresenceState
  ghost?: boolean
  roleLabel?: 'DM' | 'PLAYER' | 'SPECTATOR'
  isMuted?: boolean
  isSpeaking?: boolean
  condition?: string
  distanceLabel?: string
}

export interface GroupParticipantWithGroupId extends GroupParticipantStatus {
  roomId: UUID
}

export interface GroupPanelGroupWithParticipants extends GroupPanelGroup {
  participants: GroupParticipantStatus[]
}

export interface GroupsPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  dmUserId: UUID
  isGreenroom?: boolean
  headerModeCopy?: string
  canManageRooms: boolean
  broadcastModeEnabled: boolean
  onToggleBroadcastMode: (enabled: boolean) => Promise<void>
  dmAutoTargetOnFirstPlayerJoin?: boolean
  rooms: GroupPanelGroupWithParticipants[]
  selectedRoomId?: UUID | ''
  onSelectRoom: (roomId: UUID) => void
}

export interface WhisperGroupContextSnapshot {
  previousDmVoiceRoomId: UUID | ''
  previousBroadcastEnabled: boolean
  memberPreviousRoomIds: Record<UUID, UUID>
}

export function isWhisperGroup(group: GroupPanelGroup): boolean {
  return group.type === RoomType.PRIVATE
}

export const GROUP_ENVIRONMENT_OPTIONS = [
  'Default',
  'Forest',
  'Cave',
  'Tavern',
  'City',
  'Dungeon',
  'Night',
  'Storm',
] as const

// Legacy aliases (Room terminology) kept until migration coverage is complete.
export type RoomSelectorRoom = GroupPanelGroup
export type RoomParticipantStatus = GroupParticipantStatus
export type RoomParticipantWithRoomId = GroupParticipantWithGroupId
export type RoomSelectorRoomWithParticipants = GroupPanelGroupWithParticipants
export type RoomSelectorProps = GroupsPanelProps
export type WhisperContextSnapshot = WhisperGroupContextSnapshot
export const ENVIRONMENT_OPTIONS = GROUP_ENVIRONMENT_OPTIONS
export const isWhisperRoom = isWhisperGroup
