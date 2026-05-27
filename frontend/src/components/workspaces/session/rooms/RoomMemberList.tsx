import { useCallback, useEffect, useRef, useState } from 'react'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { LONG_PRESS_MOVE_CANCEL_PX } from '@/constants/voiceGroup.constants'
import { STATUS_PILL_ICONS, STATUS_PILL_LABELS } from '@/constants/voiceGroupStatus.constants'
import { AvatarOverlay } from './AvatarOverlay'
import { ParticipantDeviceList } from './ParticipantDeviceList'
import { PlayerContextMenu } from './context-menu/PlayerContextMenu'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
} from '@/types/groupPanel'
import type { SessionPresence } from '@/types/room'

interface RoomMemberListProps {
  room: GroupPanelGroupWithParticipants
  participants: GroupParticipantWithGroupId[]
  canManageRooms: boolean
  isGreenroom: boolean
  touchFeedbackUserId: UUID | null
  setTouchFeedbackUserId: (userId: UUID | null) => void
  getParticipantMetaLine: (member: GroupParticipantWithGroupId) => string
  getResolvedPresenceState: (
    presenceState: GroupParticipantWithGroupId['presenceState']
  ) => GroupParticipantWithGroupId['presenceState']
  getPresenceDotState: (
    presenceState: GroupParticipantWithGroupId['presenceState']
  ) => 'online' | 'offline'
  getStatEntries: (member: GroupParticipantWithGroupId) => Array<[string, unknown]>
  getResolvedGroupEnvironmentName: (room: GroupPanelGroupWithParticipants) => string
  getDeviceSessions: (userId: UUID) => NonNullable<SessionPresence['deviceSessions']>
  distanceTargets: string[]
  conditionTargets: string[]
  onApplyDistanceOverride: (userId: UUID, distanceName: string) => void
  onApplyConditionOverride: (userId: UUID, conditionName: string) => void
  onApplyMuteOverride: (userId: UUID, nextMuted: boolean) => void
  onClearMemberEffects: (userId: UUID) => void
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
  touchFeedbackUserId,
  setTouchFeedbackUserId,
  getParticipantMetaLine,
  getResolvedPresenceState,
  getPresenceDotState,
  getStatEntries,
  getResolvedGroupEnvironmentName,
  getDeviceSessions,
  distanceTargets,
  conditionTargets,
  onApplyDistanceOverride,
  onApplyConditionOverride,
  onApplyMuteOverride,
  onClearMemberEffects,
  onMemberDragStart,
  onMemberDragEnd,
}: RoomMemberListProps) {
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
    (event: React.TouchEvent<HTMLButtonElement>, memberUserId: UUID) => {
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
    },
    [clearTouchFeedback, setTouchFeedbackUserId]
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
        clearTouchFeedback(60)
      }
    },
    [clearTouchFeedback]
  )

  if (participants.length === 0) {
    return null
  }

  return (
    <>
      {participants.map((member) => {
        const canDrag = canManageRooms && !isGreenroom && member.roleLabel !== 'DM'
        const isMuted = Boolean(member.isMuted)
        const isPlayerTarget = member.roleLabel === 'PLAYER'
        const shownPresenceState = getResolvedPresenceState(member.presenceState)

        const memberButton = (
          <button
            type="button"
            className={`room-selector-member ${canDrag ? 'room-selector-member--draggable' : ''} ${member.ghost ? 'room-selector-member--ghost' : ''} ${touchFeedbackUserId === member.userId ? 'room-selector-member--touch-feedback' : ''}`}
            draggable={canDrag}
            aria-label={canDrag ? `Drag ${member.username}` : member.username}
            onDragStart={(event) => onMemberDragStart(event, member.userId, canDrag)}
            onTouchStart={(event) => handleTouchStart(event, member.userId)}
            onTouchMove={(event) => handleTouchMove(event, member.userId)}
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
              presenceState={shownPresenceState}
              isMuted={isMuted}
              isSpeaking={member.isSpeaking}
              isGhost={Boolean(member.ghost)}
            />
          </button>
        )

        const memberTooltip = (
          <Tooltip>
            <TooltipTrigger asChild>{memberButton}</TooltipTrigger>
            <TooltipContent side="bottom" className="room-selector-profile-tooltip">
              <div className="room-selector-profile">
                <div className="room-selector-profile__avatar-col">
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
                  <ParticipantDeviceList deviceSessions={getDeviceSessions(member.userId)} />
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
                        <span
                          key={key}
                          className="room-selector-profile__stat"
                          aria-label={`${key} ${String(value)}`}
                        >
                          <strong className="room-selector-profile__stat-value">
                            {String(value)}
                          </strong>
                          <span className="room-selector-profile__stat-label">{key}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="room-selector-profile__status-pills">
                    <span className="room-selector-status-pill environment">
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {STATUS_PILL_ICONS.environment}
                      </span>
                      Env: {getResolvedGroupEnvironmentName(room)}
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

        if (isPlayerTarget && !isGreenroom) {
          return (
            <PlayerContextMenu
              key={member.userId}
              enabled
              canManageRooms={canManageRooms}
              memberIsMuted={isMuted}
              distanceTargets={distanceTargets}
              conditionTargets={conditionTargets}
              onDistanceSelect={(distanceName) =>
                onApplyDistanceOverride(member.userId, distanceName)
              }
              onToggleMute={(nextMuted) => onApplyMuteOverride(member.userId, nextMuted)}
              onClearEffects={() => onClearMemberEffects(member.userId)}
              onConditionSelect={(conditionName) =>
                onApplyConditionOverride(member.userId, conditionName)
              }
            >
              <span className="room-selector-member-context-anchor">{memberTooltip}</span>
            </PlayerContextMenu>
          )
        }

        return (
          <span key={member.userId} className="room-selector-member-context-anchor">
            {memberTooltip}
          </span>
        )
      })}
    </>
  )
}
