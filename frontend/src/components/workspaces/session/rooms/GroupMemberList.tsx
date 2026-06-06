import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { GroupMemberSharedProfileHoverCard } from './GroupMemberSharedProfileHoverCard'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
} from '@/types/groupPanel'
import { GroupMemberItem } from './GroupMemberItem'
import type { HoverAnchorRect, HoverContainerRect } from './GroupMemberItem'

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
