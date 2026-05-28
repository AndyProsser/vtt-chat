import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { LONG_PRESS_MOVE_CANCEL_PX } from '@/constants/voiceGroup.constants'
import { useIsUserMuted } from '@/hooks/useIsUserMuted'
import { AvatarOverlay } from './AvatarOverlay'
import { GroupMemberProfileCard } from './GroupMemberProfileCard'
import { PlayerContextMenu } from './context-menu/PlayerContextMenu'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
} from '@/types/groupPanel'
import type { SessionPresence } from '@/types/room'

export interface GroupMemberListProps {
  room: GroupPanelGroupWithParticipants
  participants: GroupParticipantWithGroupId[]
  /**
   * Session id is threaded through purely so the leaf SpeakingIndicator can
   * subscribe to per-user speaking bits without us having to put `isSpeaking`
   * on the participant data shape (which would re-render this whole list on
   * every VAD tick). It is stable for the lifetime of the session.
   */
  sessionId: UUID
  /** Local user id — used by the SpeakingIndicator to pick the self/device path. */
  currentUserId: UUID
  canManageRooms: boolean
  isGreenroom: boolean
  touchFeedbackUserId: UUID | null
  setTouchFeedbackUserId: (userId: UUID | null) => void
  getParticipantMetaLine: (member: GroupParticipantWithGroupId) => string
  getStatEntries: (member: GroupParticipantWithGroupId) => Array<[string, unknown]>
  getResolvedGroupEnvironmentName: (room: GroupPanelGroupWithParticipants) => string
  getDeviceSessions: (userId: UUID) => NonNullable<SessionPresence['deviceSessions']>
  distanceTargets: string[]
  conditionTargets: string[]
  activeTakeoverUserId?: UUID | null
  onApplyDistanceOverride: (userId: UUID, distanceName: string) => void
  onApplyConditionOverride: (userId: UUID, conditionName: string) => void
  onApplyMuteOverride: (userId: UUID, nextMuted: boolean) => void
  onClearMemberEffects: (userId: UUID) => void
  onTakeOverPlayer?: (userId: UUID) => void
  onMemberDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    userId: UUID,
    canDrag: boolean
  ) => void
  onMemberDragEnd: () => void
}

interface GroupMemberItemProps {
  room: GroupPanelGroupWithParticipants
  member: GroupParticipantWithGroupId
  sessionId: UUID
  currentUserId: UUID
  canManageRooms: boolean
  isGreenroom: boolean
  isNarrowViewport: boolean
  touchFeedbackUserId: UUID | null
  getParticipantMetaLine: (member: GroupParticipantWithGroupId) => string
  getStatEntries: (member: GroupParticipantWithGroupId) => Array<[string, unknown]>
  getResolvedGroupEnvironmentName: (room: GroupPanelGroupWithParticipants) => string
  getDeviceSessions: (userId: UUID) => NonNullable<SessionPresence['deviceSessions']>
  distanceTargets: string[]
  conditionTargets: string[]
  activeTakeoverUserId?: UUID | null
  setTouchFeedbackUserId: (userId: UUID | null) => void
  onApplyDistanceOverride: (userId: UUID, distanceName: string) => void
  onApplyConditionOverride: (userId: UUID, conditionName: string) => void
  onApplyMuteOverride: (userId: UUID, nextMuted: boolean) => void
  onClearMemberEffects: (userId: UUID) => void
  onTakeOverPlayer?: (userId: UUID) => void
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
    previous.room === next.room &&
    previous.sessionId === next.sessionId &&
    previous.currentUserId === next.currentUserId &&
    previous.canManageRooms === next.canManageRooms &&
    previous.isGreenroom === next.isGreenroom &&
    previous.isNarrowViewport === next.isNarrowViewport &&
    previous.touchFeedbackUserId === next.touchFeedbackUserId &&
    previous.activeTakeoverUserId === next.activeTakeoverUserId &&
    previous.distanceTargets === next.distanceTargets &&
    previous.conditionTargets === next.conditionTargets &&
    previous.setTouchFeedbackUserId === next.setTouchFeedbackUserId &&
    previous.getParticipantMetaLine === next.getParticipantMetaLine &&
    previous.getStatEntries === next.getStatEntries &&
    previous.getResolvedGroupEnvironmentName === next.getResolvedGroupEnvironmentName &&
    previous.getDeviceSessions === next.getDeviceSessions &&
    previous.onApplyDistanceOverride === next.onApplyDistanceOverride &&
    previous.onApplyConditionOverride === next.onApplyConditionOverride &&
    previous.onApplyMuteOverride === next.onApplyMuteOverride &&
    previous.onClearMemberEffects === next.onClearMemberEffects &&
    previous.onTakeOverPlayer === next.onTakeOverPlayer &&
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

const GroupMemberItem = memo(function GroupMemberItem({
  room,
  member,
  sessionId,
  currentUserId,
  canManageRooms,
  isGreenroom,
  isNarrowViewport,
  touchFeedbackUserId,
  getParticipantMetaLine,
  getStatEntries,
  getResolvedGroupEnvironmentName,
  getDeviceSessions,
  distanceTargets,
  conditionTargets,
  activeTakeoverUserId,
  setTouchFeedbackUserId,
  onApplyDistanceOverride,
  onApplyConditionOverride,
  onApplyMuteOverride,
  onClearMemberEffects,
  onTakeOverPlayer,
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
      if (!touch) {
        return
      }

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

      if (!touch || !touchStart || touchStart.userId !== member.userId) {
        return
      }

      const deltaX = touch.clientX - touchStart.x
      const deltaY = touch.clientY - touchStart.y
      if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_CANCEL_PX) {
        clearTouchFeedback(60)
      }
    },
    [clearTouchFeedback, member.userId]
  )

  const canDrag = canManageRooms && !isGreenroom && member.roleLabel !== 'DM'
  const isSelf = member.userId === currentUserId
  // Live subscription to combined mute state for THIS user only.
  // Re-renders this single GroupMemberItem when the user's mute bit flips —
  // never the surrounding list or panel. The ghost class is driven by CSS
  // `:has(.avatar-ghost-badge)` so we no longer subscribe to ghost here at all.
  const isMuted = useIsUserMuted(sessionId, member.userId, isSelf)
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
      onDragStart={(event) => onMemberDragStart(event, member.userId, canDrag)}
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
        presence={{
          sessionId,
          userId: member.userId,
          isSelf,
          roomType: room.type,
        }}
      />
    </button>
  )

  const memberTooltip = (
    <Tooltip>
      <TooltipTrigger asChild>{memberButton}</TooltipTrigger>
      <TooltipContent
        side={isNarrowViewport ? 'top' : 'bottom'}
        className="room-selector-profile-tooltip"
      >
        <GroupMemberProfileCard
          sessionId={sessionId}
          isSelf={isSelf}
          member={member}
          metaLine={getParticipantMetaLine(member)}
          statEntries={getStatEntries(member)}
          environmentName={getResolvedGroupEnvironmentName(room)}
          activeTakeover={isTakeoverActive}
          deviceSessions={getDeviceSessions(member.userId)}
        />
      </TooltipContent>
    </Tooltip>
  )

  if (isPlayerTarget) {
    return (
      <PlayerContextMenu
        enabled
        canManageRooms={canManageRooms}
        isGreenroom={isGreenroom}
        memberIsMuted={isMuted}
        distanceTargets={distanceTargets}
        conditionTargets={conditionTargets}
        onDistanceSelect={(distanceName) => onApplyDistanceOverride(member.userId, distanceName)}
        onToggleMute={(nextMuted) => onApplyMuteOverride(member.userId, nextMuted)}
        onClearEffects={() => onClearMemberEffects(member.userId)}
        onConditionSelect={(conditionName) =>
          onApplyConditionOverride(member.userId, conditionName)
        }
        canTakeOver={isTakeoverEligible}
        isTakeoverActive={isTakeoverActive}
        onTakeOver={() => onTakeOverPlayer?.(member.userId)}
      >
        <span className="room-selector-member-context-anchor">{memberTooltip}</span>
      </PlayerContextMenu>
    )
  }

  return <span className="room-selector-member-context-anchor">{memberTooltip}</span>
}, areGroupMemberItemPropsEqual)

export function GroupMemberList({
  room,
  participants,
  sessionId,
  currentUserId,
  canManageRooms,
  isGreenroom,
  touchFeedbackUserId,
  setTouchFeedbackUserId,
  getParticipantMetaLine,
  getStatEntries,
  getResolvedGroupEnvironmentName,
  getDeviceSessions,
  distanceTargets,
  conditionTargets,
  activeTakeoverUserId,
  onApplyDistanceOverride,
  onApplyConditionOverride,
  onApplyMuteOverride,
  onClearMemberEffects,
  onTakeOverPlayer,
  onMemberDragStart,
  onMemberDragEnd,
}: GroupMemberListProps) {
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 720 : false
  )

  useEffect(() => {
    const handleResize = () => {
      setIsNarrowViewport(window.innerWidth <= 720)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  if (participants.length === 0) {
    return null
  }

  return (
    <>
      {participants.map((member) => (
        <GroupMemberItem
          key={member.userId}
          room={room}
          member={member}
          sessionId={sessionId}
          currentUserId={currentUserId}
          canManageRooms={canManageRooms}
          isGreenroom={isGreenroom}
          isNarrowViewport={isNarrowViewport}
          touchFeedbackUserId={touchFeedbackUserId}
          getParticipantMetaLine={getParticipantMetaLine}
          getStatEntries={getStatEntries}
          getResolvedGroupEnvironmentName={getResolvedGroupEnvironmentName}
          getDeviceSessions={getDeviceSessions}
          distanceTargets={distanceTargets}
          conditionTargets={conditionTargets}
          activeTakeoverUserId={activeTakeoverUserId}
          setTouchFeedbackUserId={setTouchFeedbackUserId}
          onApplyDistanceOverride={onApplyDistanceOverride}
          onApplyConditionOverride={onApplyConditionOverride}
          onApplyMuteOverride={onApplyMuteOverride}
          onClearMemberEffects={onClearMemberEffects}
          onTakeOverPlayer={onTakeOverPlayer}
          onMemberDragStart={onMemberDragStart}
          onMemberDragEnd={onMemberDragEnd}
        />
      ))}
    </>
  )
}

export { GroupMemberList as RoomMemberList }
export type { GroupMemberListProps as RoomMemberListProps }
