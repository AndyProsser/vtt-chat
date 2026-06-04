import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { LONG_PRESS_MOVE_CANCEL_PX } from '@/constants/voiceGroup.constants'
import { AvatarOverlay } from './AvatarOverlay'
import { GroupMemberSharedProfileHoverCard } from './GroupMemberSharedProfileHoverCard'
import { PlayerContextMenu } from './context-menu/PlayerContextMenu'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
} from '@/types/groupPanel'

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
  isSessionActive: boolean
  isGreenroom: boolean
  touchFeedbackUserId: UUID | null
  setTouchFeedbackUserId: (userId: UUID | null) => void
  getParticipantMetaLine: (member: GroupParticipantWithGroupId) => string
  getStatEntries: (member: GroupParticipantWithGroupId) => Array<[string, unknown]>
  getResolvedGroupEnvironmentName: (room: GroupPanelGroupWithParticipants) => string
  distanceTargets: string[]
  conditionTargets: string[]
  activeTakeoverUserId?: UUID | null
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
  onMemberDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    userId: UUID,
    canDrag: boolean
  ) => void
  onMemberDragEnd: () => void
}

type HoverAnchorRect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

type HoverContainerRect = {
  left: number
  right: number
}

interface GroupMemberItemProps {
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
  getStatEntries: (member: GroupParticipantWithGroupId) => Array<[string, unknown]>
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

const GroupMemberItem = memo(function GroupMemberItem({
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
  getStatEntries,
  getResolvedGroupEnvironmentName,
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

  const canDrag = canManageRooms && isSessionActive && !isGreenroom && member.roleLabel !== 'DM'
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
        highlightRoleChip={isProfileHovered}
        onRoleChipPointerEnter={(event) => {
          onProfilePillEnter(member.userId, event.currentTarget)
        }}
        onRoleChipPointerLeave={() => {
          onProfilePillLeave(member.userId)
        }}
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
        onDistanceSelect={(distanceName) => onApplyDistanceOverride(member.userId, distanceName)}
        onToggleMute={(nextMuted) => onApplyMuteOverride(member.userId, nextMuted)}
        onClearEffects={() => onClearMemberEffects(member.userId)}
        onConditionSelect={(conditionName) =>
          onApplyConditionOverride(member.userId, conditionName)
        }
        onAudioAdjust={(overrideType, parameters) =>
          onApplyAudioOverride(member.userId, overrideType, parameters)
        }
        canTakeOver={isTakeoverEligible}
        isTakeoverActive={isTakeoverActive}
        onTakeOver={() => onTakeOverPlayer?.(member.userId)}
      >
        <span className="room-selector-member-context-anchor">{memberButton}</span>
      </PlayerContextMenu>
    )
  }

  return <span className="room-selector-member-context-anchor">{memberButton}</span>
}, areGroupMemberItemPropsEqual)

export function GroupMemberList({
  room,
  participants,
  sessionId,
  currentUserId,
  canManageRooms,
  isSessionActive,
  isGreenroom,
  touchFeedbackUserId,
  setTouchFeedbackUserId,
  getParticipantMetaLine,
  getStatEntries,
  getResolvedGroupEnvironmentName,
  distanceTargets,
  conditionTargets,
  activeTakeoverUserId,
  onApplyDistanceOverride,
  onApplyConditionOverride,
  onApplyMuteOverride,
  onApplyAudioOverride,
  onClearMemberEffects,
  onTakeOverPlayer,
  onMemberDragStart,
  onMemberDragEnd,
}: GroupMemberListProps) {
  const [hoveredProfileUserId, setHoveredProfileUserId] = useState<UUID | null>(null)
  const [hoverAnchorRect, setHoverAnchorRect] = useState<HoverAnchorRect | null>(null)
  const [hoverContainerRect, setHoverContainerRect] = useState<HoverContainerRect | null>(null)
  const hoverCloseTimerRef = useRef<number | null>(null)
  const hoveredProfileUserIdRef = useRef<UUID | null>(null)

  const hoveredProfileMember = useMemo(
    () => participants.find((member) => member.userId === hoveredProfileUserId) ?? null,
    [hoveredProfileUserId, participants]
  )

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }, [])

  const closeHoverCard = useCallback(() => {
    clearHoverCloseTimer()
    setHoveredProfileUserId(null)
    setHoverAnchorRect(null)
    setHoverContainerRect(null)
  }, [clearHoverCloseTimer])

  useEffect(() => {
    hoveredProfileUserIdRef.current = hoveredProfileUserId
  }, [hoveredProfileUserId])

  const scheduleHoverCardClose = useCallback(() => {
    clearHoverCloseTimer()
    hoverCloseTimerRef.current = window.setTimeout(() => {
      closeHoverCard()
      hoverCloseTimerRef.current = null
    }, 120)
  }, [clearHoverCloseTimer, closeHoverCard])

  const handleProfilePillEnter = useCallback(
    (userId: UUID, element: HTMLElement) => {
      clearHoverCloseTimer()
      const rect = element.getBoundingClientRect()
      const roomListElement =
        element.closest('.room-selector-members-list') || element.closest('.room-selector-item')
      const roomListRect = roomListElement?.getBoundingClientRect() ?? null
      setHoveredProfileUserId(userId)
      setHoverAnchorRect({
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      })
      setHoverContainerRect(
        roomListRect
          ? {
              left: roomListRect.left,
              right: roomListRect.right,
            }
          : null
      )
    },
    [clearHoverCloseTimer]
  )

  const handleProfilePillLeave = useCallback(
    (userId: UUID) => {
      if (hoveredProfileUserIdRef.current !== userId) {
        return
      }
      scheduleHoverCardClose()
    },
    [scheduleHoverCardClose]
  )

  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current !== null) {
        window.clearTimeout(hoverCloseTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!hoveredProfileUserId) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) {
        closeHoverCard()
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => {
      window.removeEventListener('wheel', handleWheel)
    }
  }, [closeHoverCard, hoveredProfileUserId])

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
          isSessionActive={isSessionActive}
          isGreenroom={isGreenroom}
          touchFeedbackUserId={touchFeedbackUserId}
          isProfileHovered={hoveredProfileUserId === member.userId}
          getParticipantMetaLine={getParticipantMetaLine}
          getStatEntries={getStatEntries}
          getResolvedGroupEnvironmentName={getResolvedGroupEnvironmentName}
          distanceTargets={distanceTargets}
          conditionTargets={conditionTargets}
          activeTakeoverUserId={activeTakeoverUserId}
          setTouchFeedbackUserId={setTouchFeedbackUserId}
          onApplyDistanceOverride={onApplyDistanceOverride}
          onApplyConditionOverride={onApplyConditionOverride}
          onApplyMuteOverride={onApplyMuteOverride}
          onApplyAudioOverride={onApplyAudioOverride}
          onClearMemberEffects={onClearMemberEffects}
          onTakeOverPlayer={onTakeOverPlayer}
          onProfilePillEnter={handleProfilePillEnter}
          onProfilePillLeave={handleProfilePillLeave}
          onMemberDragStart={onMemberDragStart}
          onMemberDragEnd={onMemberDragEnd}
        />
      ))}
      <GroupMemberSharedProfileHoverCard
        sessionId={sessionId}
        currentUserId={currentUserId}
        room={room}
        member={hoveredProfileMember}
        activeTakeoverUserId={activeTakeoverUserId}
        anchorRect={hoverAnchorRect}
        containerRect={hoverContainerRect}
        getParticipantMetaLine={getParticipantMetaLine}
        getStatEntries={getStatEntries}
        getResolvedGroupEnvironmentName={getResolvedGroupEnvironmentName}
        onMouseEnter={closeHoverCard}
        onMouseLeave={closeHoverCard}
      />
    </>
  )
}

export { GroupMemberList as RoomMemberList }
export type { GroupMemberListProps as RoomMemberListProps }
