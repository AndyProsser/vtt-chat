import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
} from '@/types/groupPanel'
import type { GroupCardProps } from './RoomGroupCard'

export function areSameParticipant(
  previous: GroupParticipantWithGroupId,
  next: GroupParticipantWithGroupId
): boolean {
  return (
    previous.userId === next.userId &&
    previous.roomId === next.roomId &&
    previous.username === next.username &&
    previous.avatarUrl === next.avatarUrl &&
    previous.characterName === next.characterName &&
    previous.playerName === next.playerName &&
    previous.characterClass === next.characterClass &&
    previous.characterRace === next.characterRace &&
    previous.level === next.level &&
    previous.characterStats === next.characterStats &&
    previous.roleLabel === next.roleLabel &&
    previous.condition === next.condition &&
    previous.distanceLabel === next.distanceLabel
  )
}

export function areSameParticipants(
  previous: GroupParticipantWithGroupId[],
  next: GroupParticipantWithGroupId[]
): boolean {
  if (previous.length !== next.length) return false
  for (let index = 0; index < previous.length; index += 1) {
    if (!areSameParticipant(previous[index], next[index])) return false
  }
  return true
}

export function areGroupCardPropsEqual(previous: GroupCardProps, next: GroupCardProps): boolean {
  return (
    previous.selected === next.selected &&
    previous.canManageRooms === next.canManageRooms &&
    previous.isGreenroom === next.isGreenroom &&
    previous.isDenseRoomLayout === next.isDenseRoomLayout &&
    previous.draggedUserId === next.draggedUserId &&
    previous.broadcastModeEnabled === next.broadcastModeEnabled &&
    previous.whisperModeLocked === next.whisperModeLocked &&
    previous.whisperRoomId === next.whisperRoomId &&
    previous.whisperEndBlockedByPendingMoves === next.whisperEndBlockedByPendingMoves &&
    previous.pendingDelete === next.pendingDelete &&
    previous.selectedRoomId === next.selectedRoomId &&
    previous.environmentPickerRoomId === next.environmentPickerRoomId &&
    previous.touchFeedbackUserId === next.touchFeedbackUserId &&
    previous.dmUserId === next.dmUserId &&
    previous.sessionId === next.sessionId &&
    previous.currentUserId === next.currentUserId &&
    previous.isSessionActive === next.isSessionActive &&
    previous.activeTakeoverUserId === next.activeTakeoverUserId &&
    previous.environmentPickerLayerRef === next.environmentPickerLayerRef &&
    previous.distanceTargets === next.distanceTargets &&
    previous.conditionTargets === next.conditionTargets &&
    previous.onApplyEnvironment === next.onApplyEnvironment &&
    previous.onToggleEnvironmentPicker === next.onToggleEnvironmentPicker &&
    previous.onSelectRoom === next.onSelectRoom &&
    previous.onSetDmVoiceRoom === next.onSetDmVoiceRoom &&
    previous.onDeleteGroup === next.onDeleteGroup &&
    previous.onRoomDragOver === next.onRoomDragOver &&
    previous.onRoomDrop === next.onRoomDrop &&
    previous.onApplyDistanceOverride === next.onApplyDistanceOverride &&
    previous.onApplyConditionOverride === next.onApplyConditionOverride &&
    previous.onApplyMuteOverride === next.onApplyMuteOverride &&
    previous.onApplyAudioOverride === next.onApplyAudioOverride &&
    previous.onClearMemberEffects === next.onClearMemberEffects &&
    previous.onTakeOverPlayer === next.onTakeOverPlayer &&
    previous.onMemberDragStart === next.onMemberDragStart &&
    previous.onMemberDragEnd === next.onMemberDragEnd &&
    previous.getDisplayRoomName === next.getDisplayRoomName &&
    previous.getResolvedEnvironmentName === next.getResolvedEnvironmentName &&
    previous.getParticipantMetaLine === next.getParticipantMetaLine &&
    previous.getStatEntries === next.getStatEntries &&
    previous.room.id === next.room.id &&
    previous.room.name === next.room.name &&
    previous.room.type === next.room.type &&
    previous.room.memberCount === next.room.memberCount &&
    previous.room.environmentName === next.room.environmentName &&
    areSameParticipants(previous.participants, next.participants)
  )
}

export type { GroupPanelGroupWithParticipants, GroupParticipantWithGroupId }
