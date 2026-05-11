import type { UUID } from '@shared'
import { PresenceState, RoomType } from '@shared'

export interface RoomSelectorRoom {
  id: UUID
  name: string
  type: RoomType
  memberCount: number
  environmentName?: string
}

export interface RoomParticipantStatus {
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
  roleLabel?: 'DM' | 'PLAYER'
  isMuted?: boolean
  isSpeaking?: boolean
  condition?: string
  distanceLabel?: string
}

export interface RoomParticipantWithRoomId extends RoomParticipantStatus {
  roomId: UUID
}

export interface RoomSelectorRoomWithParticipants extends RoomSelectorRoom {
  participants: RoomParticipantStatus[]
}

export interface RoomSelectorProps {
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
  rooms: RoomSelectorRoomWithParticipants[]
  selectedRoomId?: UUID | ''
  onSelectRoom: (roomId: UUID) => void
}

export interface WhisperContextSnapshot {
  previousDmVoiceRoomId: UUID | ''
  previousBroadcastEnabled: boolean
  memberPreviousRoomIds: Record<UUID, UUID>
}

export function isWhisperRoom(room: RoomSelectorRoom): boolean {
  return room.type === RoomType.PRIVATE
}

export const ENVIRONMENT_OPTIONS = [
  'Default',
  'Forest',
  'Cave',
  'Tavern',
  'City',
  'Dungeon',
  'Night',
  'Storm',
] as const
