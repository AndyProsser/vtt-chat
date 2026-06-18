import { memo, useCallback, useEffect, useRef } from 'react'
import type { UUID } from '@shared'
import { LONG_PRESS_MOVE_CANCEL_PX } from '@/constants/voiceGroup.constants'
import { AvatarOverlay } from './AvatarOverlay'
import { PlayerContextMenu } from './context-menu/PlayerContextMenu'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
  StatGroups,
} from '@/types/groupPanel'

export type HoverAnchorRect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export type HoverContainerRect = {
  left: number
  right: number
}

export interface GroupMemberItemProps {
  room: GroupPanelGroupWithParticipants
  member: GroupParticipantWithGroupId
  sessionId: UUID
  currentUserId: UUID
  canManageRooms: boolean
  isSessionActive: boolean
  isGreenroom: boolean
  touchFeedbackUserId: UUID | null
  isProfileHovered: boolean
  getParticipantMetaLine: (member: GroupParticipantWithGroupId) => string
  getStatEntries: (member: GroupParticipantWithGroupId) => StatGroups
  getResolvedGroupEnvironmentName: (room: GroupPanelGroupWithParticipants) => string
  distanceTargets: string[]
  conditionTargets: string[]
  activeTakeoverUserId?: UUID | null
  setTouchFeedbackUserId: (userId: UUID | null) => void
  onApplyDistanceOverride: (userId: UUID, distanceName: string) => void
  onApplyConditionOverride: (userId: UUID, conditionName: string) => void
  onApplyMuteOverride: (userId: UUID, nextMuted: boolean) => void
  onApplyAudioOverride: (
    userId: UUID,
    overrideType: 'GAIN' | 'FILTER',
    parameters: Record<string, unknown> | null
  ) => void
  onClearMemberEffects: (userId: UUID) => void
  onTakeOverPlayer?: (userId: UUID) => void
  onProfilePillEnter: (userId: UUID, element: HTMLElement) => void
  onProfilePillLeave: (userId: UUID) => void
  onMemberDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    userId: UUID,
    canDrag: boolean
  ) => void
  onMemberDragEnd: () => void
}

function areGroupMemberItemPropsEqual(
  previous: GroupMemberItemProps,
  next: GroupMemberItemProps
): boolean {
  const left = previous.member
  const right = next.member

  return (
    previous.room.id === next.room.id &&
    previous.room.name === next.room.name &&
    previous.room.type === next.room.type &&
    previous.room.memberCount === next.room.memberCount &&
    previous.room.environmentName === next.room.environmentName &&
    previous.sessionId === next.sessionId &&
    previous.currentUserId === next.currentUserId &&
    previous.canManageRooms === next.canManageRooms &&
    previous.isSessionActive === next.isSessionActive &&
    previous.isGreenroom === next.isGreenroom &&
    previous.touchFeedbackUserId === next.touchFeedbackUserId &&
    previous.isProfileHovered === next.isProfileHovered &&
    previous.activeTakeoverUserId === next.activeTakeoverUserId &&
    previous.distanceTargets === next.distanceTargets &&
    previous.conditionTargets === next.conditionTargets &&
    previous.setTouchFeedbackUserId === next.setTouchFeedbackUserId &&
    previous.getParticipantMetaLine === next.getParticipantMetaLine &&
    previous.getStatEntries === next.getStatEntries &&
    previous.getResolvedGroupEnvironmentName === next.getResolvedGroupEnvironmentName &&
    previous.onApplyDistanceOverride === next.onApplyDistanceOverride &&
    previous.onApplyConditionOverride === next.onApplyConditionOverride &&
    previous.onApplyMuteOverride === next.onApplyMuteOverride &&
    previous.onApplyAudioOverride === next.onApplyAudioOverride &&
    previous.onClearMemberEffects === next.onClearMemberEffects &&
    previous.onTakeOverPlayer === next.onTakeOverPlayer &&
    previous.onProfilePillEnter === next.onProfilePillEnter &&
    previous.onProfilePillLeave === next.onProfilePillLeave &&
    previous.onMemberDragStart === next.onMemberDragStart &&
    previous.onMemberDragEnd === next.onMemberDragEnd &&
    left.userId === right.userId &&
    left.roomId === right.roomId &&
    left.username === right.username &&
    left.avatarUrl === right.avatarUrl &&
    left.characterName === right.characterName &&
    left.playerName === right.playerName &&
    left.characterClass === right.characterClass &&
    left.characterSubclass === right.characterSubclass &&
    left.characterRace === right.characterRace &&
    left.level === right.level &&
    left.characterStats === right.characterStats &&
    left.roleLabel === right.roleLabel &&
    left.condition === right.condition &&
    left.distanceLabel === right.distanceLabel
  )
}

export const GroupMemberItem = memo(function GroupMemberItem({
  room,
  member,
  sessionId,
  currentUserId,
  canManageRooms,
  isSessionActive,
  isGreenroom,
  touchFeedbackUserId,
  isProfileHovered,
  getParticipantMetaLine,
  getStatEntries: _getStatEntries,
  getResolvedGroupEnvironmentName: _getResolvedGroupEnvironmentName,
  distanceTargets,
  conditionTargets,
  activeTakeoverUserId,
  setTouchFeedbackUserId,
  onApplyDistanceOverride,
  onApplyConditionOverride,
  onApplyMuteOverride,
  onApplyAudioOverride,
  onClearMemberEffects,
  onTakeOverPlayer,
  onProfilePillEnter,
  onProfilePillLeave,
  onMemberDragStart,
  onMemberDragEnd,
}: GroupMemberItemProps) {
  const touchFeedbackTimerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; userId: UUID } | null>(null)

  const clearTouchFeedback = useCallback(
    (delayMs = 0) => {
      if (touchFeedbackTimerRef.current !== null) {
        window.clearTimeout(touchFeedbackTimerRef.current)
        touchFeedbackTimerRef.current = null
      }

      if (delayMs <= 0) {
        setTouchFeedbackUserId(null)
        return
      }

      touchFeedbackTimerRef.current = window.setTimeout(() => {
        setTouchFeedbackUserId(null)
        touchFeedbackTimerRef.current = null
      }, delayMs)
    },
    [setTouchFeedbackUserId]
  )

  useEffect(() => {
    return () => {
      if (touchFeedbackTimerRef.current !== null) {
        window.clearTimeout(touchFeedbackTimerRef.current)
      }
    }
  }, [])

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>) => {
      clearTouchFeedback()
      const touch = event.touches[0]
      if (!touch) return
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        userId: member.userId,
      }
      setTouchFeedbackUserId(member.userId)
    },
    [clearTouchFeedback, member.userId, setTouchFeedbackUserId]
  )

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>) => {
      const touch = event.touches[0]
      const touchStart = touchStartRef.current
      if (!touch || !touchStart || touchStart.userId !== member.userId) return
      const deltaX = touch.clientX - touchStart.x
      const deltaY = touch.clientY - touchStart.y
      if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_CANCEL_PX) {
        clearTouchFeedback(60)
      }
    },
    [clearTouchFeedback, member.userId]
  )

  const canDrag = canManageRooms && isSessionActive && !isGreenroom && member.roleLabel !== 'DM'

  // Stable per-member context-menu handlers — bind member.userId once so
  // PlayerContextMenu sees the same references between renders.
  const handleDistanceSelect = useCallback(
    (distanceName: string) => onApplyDistanceOverride(member.userId, distanceName),
    [member.userId, onApplyDistanceOverride]
  )
  const handleToggleMute = useCallback(
    (nextMuted: boolean) => onApplyMuteOverride(member.userId, nextMuted),
    [member.userId, onApplyMuteOverride]
  )
  const handleClearEffects = useCallback(
    () => onClearMemberEffects(member.userId),
    [member.userId, onClearMemberEffects]
  )
  const handleConditionSelect = useCallback(
    (conditionName: string) => onApplyConditionOverride(member.userId, conditionName),
    [member.userId, onApplyConditionOverride]
  )
  const handleAudioAdjust = useCallback(
    (overrideType: 'GAIN' | 'FILTER', parameters: Record<string, unknown> | null) =>
      onApplyAudioOverride(member.userId, overrideType, parameters),
    [member.userId, onApplyAudioOverride]
  )
  const handleTakeOver = useCallback(
    () => onTakeOverPlayer?.(member.userId),
    [member.userId, onTakeOverPlayer]
  )
  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>) => onMemberDragStart(event, member.userId, canDrag),
    [canDrag, member.userId, onMemberDragStart]
  )

  // Stable references so areAvatarOverlayPropsEqual's callback equality check
  // can hold — inline arrows created here would always return false.
  const handleRoleChipPointerEnter = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      onProfilePillEnter(member.userId, event.currentTarget)
    },
    [member.userId, onProfilePillEnter]
  )

  const handleRoleChipPointerLeave = useCallback(() => {
    onProfilePillLeave(member.userId)
  }, [member.userId, onProfilePillLeave])
  const isSelf = member.userId === currentUserId
  const isPlayerTarget = member.roleLabel !== 'DM'
  const isTakeoverEligible = member.roleLabel === 'PLAYER'
  const isTakeoverActive = activeTakeoverUserId === member.userId

  const memberButton = (
    <button
      type="button"
      className={`room-selector-member ${canDrag ? 'room-selector-member--draggable' : ''} ${touchFeedbackUserId === member.userId ? 'room-selector-member--touch-feedback' : ''} ${isTakeoverActive ? 'room-selector-member--takeover-active' : ''}`}
      draggable={canDrag}
      aria-label={canDrag ? `Drag ${member.username}` : member.username}
      title={undefined}
      onDragStart={handleDragStart}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => {
        clearTouchFeedback(80)
      }}
      onTouchCancel={() => {
        clearTouchFeedback()
      }}
      onDragEnd={onMemberDragEnd}
    >
      <AvatarOverlay
        username={member.characterName || member.username}
        avatarUrl={member.avatarUrl}
        roleLabel={member.roleLabel}
        metaLine={getParticipantMetaLine(member)}
        highlightRoleChip={isProfileHovered}
        onRoleChipPointerEnter={handleRoleChipPointerEnter}
        onRoleChipPointerLeave={handleRoleChipPointerLeave}
        presence={{
          sessionId,
          userId: member.userId,
          isSelf,
          roomType: room.type,
        }}
      />
    </button>
  )

  if (isPlayerTarget) {
    return (
      <PlayerContextMenu
        enabled
        canManageRooms={canManageRooms}
        isGreenroom={isGreenroom}
        sessionId={sessionId}
        userId={member.userId}
        isSelf={isSelf}
        distanceTargets={distanceTargets}
        conditionTargets={conditionTargets}
        onDistanceSelect={handleDistanceSelect}
        onToggleMute={handleToggleMute}
        onClearEffects={handleClearEffects}
        onConditionSelect={handleConditionSelect}
        onAudioAdjust={handleAudioAdjust}
        canTakeOver={isTakeoverEligible}
        isTakeoverActive={isTakeoverActive}
        onTakeOver={handleTakeOver}
      >
        <span className="room-selector-member-context-anchor">{memberButton}</span>
      </PlayerContextMenu>
    )
  }

  return <span className="room-selector-member-context-anchor">{memberButton}</span>
}, areGroupMemberItemPropsEqual)
