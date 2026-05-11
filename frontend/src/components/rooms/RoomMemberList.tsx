import { useCallback, useEffect, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../core-ui'
import { LONG_PRESS_MOVE_CANCEL_PX, LONG_PRESS_OPEN_MS } from '../../constants/voiceGroup.constants'
import { STATUS_PILL_ICONS, STATUS_PILL_LABELS } from '../../constants/voiceGroupStatus.constants'
import { AvatarOverlay } from './AvatarOverlay'
import type {
  RadialMenuState,
  RoomParticipantWithRoomId,
  RoomSelectorRoomWithParticipants,
} from './roomSelector.types'

interface RoomMemberListProps {
  room: RoomSelectorRoomWithParticipants
  participants: RoomParticipantWithRoomId[]
  canManageRooms: boolean
  isGreenroom: boolean
  dmUserId: UUID
  touchFeedbackUserId: UUID | null
  setTouchFeedbackUserId: (userId: UUID | null) => void
  getParticipantMetaLine: (member: RoomParticipantWithRoomId) => string
  getResolvedPresenceState: (
    presenceState: RoomParticipantWithRoomId['presenceState']
  ) => RoomParticipantWithRoomId['presenceState']
  getPresenceDotState: (
    presenceState: RoomParticipantWithRoomId['presenceState']
  ) => 'online' | 'offline'
  getStatEntries: (member: RoomParticipantWithRoomId) => Array<[string, unknown]>
  getResolvedEnvironmentName: (room: RoomSelectorRoomWithParticipants) => string
  onOpenRadialMenu: (params: Omit<RadialMenuState, 'mode'>) => void
  onMemberDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    userId: UUID,
    canDrag: boolean
  ) => void
  onMemberDragEnd: () => void
}

export function RoomMemberList({
  room,
  participants,
  canManageRooms,
  isGreenroom,
  dmUserId,
  touchFeedbackUserId,
  setTouchFeedbackUserId,
  getParticipantMetaLine,
  getResolvedPresenceState,
  getPresenceDotState,
  getStatEntries,
  getResolvedEnvironmentName,
  onOpenRadialMenu,
  onMemberDragStart,
  onMemberDragEnd,
}: RoomMemberListProps) {
  const longPressTimerRef = useRef<number | null>(null)
  const touchFeedbackTimerRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; userId: UUID } | null>(null)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

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
      clearLongPressTimer()
      if (touchFeedbackTimerRef.current !== null) {
        window.clearTimeout(touchFeedbackTimerRef.current)
      }
    }
  }, [clearLongPressTimer])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, memberUserId: UUID, memberRoomId: UUID) => {
      event.preventDefault()
      onOpenRadialMenu({
        x: event.clientX,
        y: event.clientY,
        memberUserId,
        memberRoomId,
      })
    },
    [onOpenRadialMenu]
  )

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>, memberUserId: UUID, memberRoomId: UUID) => {
      clearLongPressTimer()
      clearTouchFeedback()
      const touch = event.touches[0]
      if (!touch) {
        return
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        userId: memberUserId,
      }
      setTouchFeedbackUserId(memberUserId)

      longPressTimerRef.current = window.setTimeout(() => {
        onOpenRadialMenu({
          x: touch.clientX,
          y: touch.clientY,
          memberUserId,
          memberRoomId,
        })
      }, LONG_PRESS_OPEN_MS)
    },
    [clearLongPressTimer, clearTouchFeedback, onOpenRadialMenu, setTouchFeedbackUserId]
  )

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>, memberUserId: UUID) => {
      const touch = event.touches[0]
      const touchStart = touchStartRef.current

      if (!touch || !touchStart || touchStart.userId !== memberUserId) {
        return
      }

      const deltaX = touch.clientX - touchStart.x
      const deltaY = touch.clientY - touchStart.y
      if (Math.hypot(deltaX, deltaY) > LONG_PRESS_MOVE_CANCEL_PX) {
        clearLongPressTimer()
        clearTouchFeedback(60)
      }
    },
    [clearLongPressTimer, clearTouchFeedback]
  )

  if (participants.length === 0) {
    return null
  }

  return (
    <>
      {participants.map((member) => {
        const canDrag = canManageRooms && !isGreenroom && member.roleLabel !== 'DM'
        const isMuted = Boolean(member.isMuted)
        const shownPresenceState = getResolvedPresenceState(member.presenceState)

        return (
          <Tooltip key={member.userId}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`room-selector-member ${canDrag ? 'room-selector-member--draggable' : ''} ${member.ghost ? 'room-selector-member--ghost' : ''} ${touchFeedbackUserId === member.userId ? 'room-selector-member--touch-feedback' : ''}`}
                draggable={canDrag}
                aria-label={canDrag ? `Drag ${member.username}` : member.username}
                onDragStart={(event) => onMemberDragStart(event, member.userId, canDrag)}
                onContextMenu={(event) => handleContextMenu(event, member.userId, room.id)}
                onTouchStart={(event) => handleTouchStart(event, member.userId, room.id)}
                onTouchMove={(event) => handleTouchMove(event, member.userId)}
                onTouchEnd={() => {
                  clearLongPressTimer()
                  clearTouchFeedback(80)
                }}
                onTouchCancel={() => {
                  clearLongPressTimer()
                  clearTouchFeedback()
                }}
                onDragEnd={onMemberDragEnd}
              >
                <AvatarOverlay
                  username={member.characterName || member.username}
                  avatarUrl={member.avatarUrl}
                  roleLabel={member.roleLabel}
                  metaLine={getParticipantMetaLine(member)}
                  presenceState={shownPresenceState}
                  isMuted={isMuted}
                  isSpeaking={member.isSpeaking}
                  isGhost={Boolean(member.ghost)}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="room-selector-profile-tooltip">
              <div className="room-selector-profile">
                <div className="room-selector-profile__avatar" aria-hidden="true">
                  {member.avatarUrl ? (
                    <img src={member.avatarUrl} alt="" />
                  ) : (
                    (member.characterName || member.username).charAt(0).toUpperCase()
                  )}
                  {isMuted ? (
                    <span className="room-selector-profile__avatar-muted-badge">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        mic_off
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className="room-selector-profile__meta">
                  <div className="room-selector-profile__title-row">
                    <span className="room-selector-profile__name-wrap">
                      <strong>{member.characterName || member.username}</strong>
                      <span className="room-selector-status-pill role compact">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {STATUS_PILL_ICONS.role}
                        </span>
                        {member.roleLabel || 'PLAYER'}
                      </span>
                    </span>
                    <span
                      className="room-selector-presence-dot"
                      data-state={getPresenceDotState(shownPresenceState)}
                      role="status"
                      aria-label={shownPresenceState}
                    >
                      <span className="room-selector-presence-dot__inner" aria-hidden="true" />
                    </span>
                  </div>
                  {member.playerName &&
                  member.playerName !== (member.characterName || member.username) ? (
                    <span className="room-selector-profile__player-name">{member.playerName}</span>
                  ) : null}
                  <p>{getParticipantMetaLine(member)}</p>
                  {getStatEntries(member).length > 0 ? (
                    <div className="room-selector-profile__stats">
                      {getStatEntries(member).map(([key, value]) => (
                        <span key={key}>
                          {key}: {String(value)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="room-selector-profile__status-pills">
                    <span className="room-selector-status-pill environment">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {STATUS_PILL_ICONS.environment}
                      </span>
                      Env: {getResolvedEnvironmentName(room)}
                    </span>
                    <span className="room-selector-status-pill distance">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {STATUS_PILL_ICONS.distance}
                      </span>
                      Distance: {member.distanceLabel || STATUS_PILL_LABELS.distanceDefault}
                    </span>
                    <span className="room-selector-status-pill condition">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {STATUS_PILL_ICONS.condition}
                      </span>
                      Condition: {member.condition || STATUS_PILL_LABELS.conditionNone}
                    </span>
                    {isMuted ? (
                      <span className="room-selector-status-pill muted">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {STATUS_PILL_ICONS.muted}
                        </span>
                        {STATUS_PILL_LABELS.muted}
                      </span>
                    ) : null}
                    {member.isSpeaking ? (
                      <span className="room-selector-status-pill speaking">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {STATUS_PILL_ICONS.speaking}
                        </span>
                        {STATUS_PILL_LABELS.speaking}
                      </span>
                    ) : null}
                    {member.ghost ? (
                      <span className="room-selector-status-pill ghost">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          visibility_off
                        </span>
                        Ghost Mode
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </>
  )
}
