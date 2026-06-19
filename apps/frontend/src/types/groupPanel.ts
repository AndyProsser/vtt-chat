import type { UUID, SessionState } from '@shared'
import { RoomType } from '@shared'

export interface GroupPanelGroup {
  id: UUID
  name: string
  type: RoomType
  memberCount: number
  environmentName?: string
}

/**
 * Group participant projection used by the rightbar/leftbar group panels.
 *
 * NOTE: presence/ghost/mute/speaking are intentionally NOT modelled here.
 * Those bits are subscribed to per-user inside leaf indicators
 * (<PresenceIndicator />, <GhostIndicator />, <MicMutedIndicator />,
 * <SpeakingIndicator />) so a flip re-renders only the matching leaf and
 * never invalidates this participant object. See the leaf-isolation pattern
 * in copilot-instructions.md and the SpeakingIndicator doc comment.
 */
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
  roleLabel?: 'DM' | 'PLAYER' | 'SPECTATOR'
  condition?: string
  /** D&D status conditions synced from extension (e.g. "Poisoned", "Stunned"). Separate from DM audio conditions. */
  characterConditions?: string[]
  distanceLabel?: string
}

export interface GroupParticipantWithGroupId extends GroupParticipantStatus {
  roomId: UUID
}

export interface GroupPanelGroupWithParticipants extends GroupPanelGroup {
  participants: GroupParticipantStatus[]
}

export interface AbilityScoreStat {
  label: string
  value: number
  modifier: string
}

/** Structured stat groups returned by getGroupStatEntries. */
export interface StatGroups {
  combatStats: Array<[string, string]>
  abilityScores: AbilityScoreStat[]
}

export interface GroupsPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  sessionState: SessionState
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

import { ENVIRONMENT_PRESETS } from '@shared'

/** Ordered list of environment names for pickers. Derived from the canonical shared catalogue. */
export const GROUP_ENVIRONMENT_OPTIONS = ENVIRONMENT_PRESETS.map((p) => p.name) as string[]

// Legacy aliases (Room terminology) kept until migration coverage is complete.
export type RoomSelectorRoom = GroupPanelGroup
export type RoomParticipantStatus = GroupParticipantStatus
export type RoomParticipantWithRoomId = GroupParticipantWithGroupId
export type RoomSelectorRoomWithParticipants = GroupPanelGroupWithParticipants
export type RoomSelectorProps = GroupsPanelProps
export type WhisperContextSnapshot = WhisperGroupContextSnapshot
export const ENVIRONMENT_OPTIONS = GROUP_ENVIRONMENT_OPTIONS
export const isWhisperRoom = isWhisperGroup
