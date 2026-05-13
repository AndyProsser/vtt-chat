import { useMemo } from 'react'
import type { RefObject } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../core-ui'
import { isGreenRoomName } from '../../constants/roomPresence.constants'
import { Icon } from '../ui/Icon'
import { resolveEnvironmentGlyph } from '../../constants/voiceGroup.constants'
import { GroupMemberList } from './GroupMemberList'
import { GROUP_ENVIRONMENT_OPTIONS, isWhisperGroup } from './groupPanel.types'
import type {
  GroupPanelGroupWithParticipants,
  GroupParticipantWithGroupId,
} from './groupPanel.types'

export interface GroupCardProps {
  room: GroupPanelGroupWithParticipants
  selected: boolean
  participants: GroupParticipantWithGroupId[]
  canManageRooms: boolean
  isGreenroom: boolean
  isDenseRoomLayout: boolean
  draggedUserId: UUID | null
  broadcastModeEnabled: boolean
  whisperModeLocked: boolean
  whisperRoomId?: UUID
  whisperEndBlockedByPendingMoves: boolean
  pendingDelete: boolean
  selectedRoomId?: UUID | ''
  environmentPickerRoomId: UUID | null
  environmentPickerLayerRef: RefObject<HTMLDivElement | null>
  touchFeedbackUserId: UUID | null
  setTouchFeedbackUserId: (userId: UUID | null) => void
  dmUserId: UUID
  onApplyEnvironment: (roomId: UUID, environmentName: string) => void
  onToggleEnvironmentPicker: (roomId: UUID) => void
  onSelectRoom: (roomId: UUID) => void
  onSetDmVoiceRoom: (roomId: UUID) => void
  onDeleteGroup: (room: GroupPanelGroupWithParticipants) => void
  onRoomDragOver: (event: React.DragEvent<HTMLElement>, disabled: boolean) => void
  onRoomDrop: (event: React.DragEvent<HTMLElement>, roomId: UUID, disabled: boolean) => void
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
  getDisplayRoomName: (room: GroupPanelGroupWithParticipants) => string
  getResolvedEnvironmentName: (room: GroupPanelGroupWithParticipants) => string
  getParticipantMetaLine: (member: GroupParticipantWithGroupId) => string
  getResolvedPresenceState: (
    presenceState: GroupParticipantWithGroupId['presenceState']
  ) => GroupParticipantWithGroupId['presenceState']
  getPresenceDotState: (
    presenceState: GroupParticipantWithGroupId['presenceState']
  ) => 'online' | 'offline'
  getStatEntries: (member: GroupParticipantWithGroupId) => Array<[string, unknown]>
}

export type RoomGroupCardProps = GroupCardProps

export function RoomGroupCard({
  room,
  selected,
  participants,
  canManageRooms,
  isGreenroom,
  isDenseRoomLayout,
  draggedUserId,
  broadcastModeEnabled,
  whisperModeLocked,
  whisperRoomId,
  whisperEndBlockedByPendingMoves,
  pendingDelete,
  selectedRoomId,
  environmentPickerRoomId,
  environmentPickerLayerRef,
  touchFeedbackUserId,
  setTouchFeedbackUserId,
  dmUserId,
  onApplyEnvironment,
  onToggleEnvironmentPicker,
  onSelectRoom,
  onSetDmVoiceRoom,
  onDeleteGroup,
  onRoomDragOver,
  onRoomDrop,
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
  getDisplayRoomName,
  getResolvedEnvironmentName,
  getParticipantMetaLine,
  getResolvedPresenceState,
  getPresenceDotState,
  getStatEntries,
}: GroupCardProps) {
  const isGreenroomCard = isGreenRoomName(room.name)
  const isWhisperRoomGroup = isWhisperGroup(room)
  const whisperRoomParticipantCount = participants.filter(
    (participant) => participant.userId !== dmUserId
  ).length
  const isEmptyWhisperGroup = isWhisperRoomGroup && whisperRoomParticipantCount === 0
  const isEmptyGroup =
    participants.length === 0 &&
    room.type !== RoomType.MAIN &&
    !isWhisperRoomGroup &&
    !isGreenRoomName(room.name)

  const computedHasDetectedPlayers = participants.some(
    (participant) => participant.userId !== dmUserId
  )
  const isEmptyTargetableGroup = room.type === RoomType.GROUP && !computedHasDetectedPlayers
  const collapseForDrag = Boolean(draggedUserId) && !selected && !isWhisperRoomGroup
  const isCompactGroup = isEmptyGroup || isWhisperRoomGroup || collapseForDrag
  const memberListClassName = useMemo(
    () =>
      [
        'room-selector-members-list',
        isCompactGroup ? 'room-selector-members-list--hidden' : '',
        selected ? 'room-selector-members-list--selected' : '',
      ]
        .filter(Boolean)
        .join(' '),
    [isCompactGroup, selected]
  )

  return (
    <section
      data-room-id={room.id}
      className={`room-selector-item ${selected ? 'selected' : ''} ${isCompactGroup ? 'room-selector-item--collapsed' : ''} ${isEmptyWhisperGroup ? 'room-selector-item--whisper-empty' : ''} ${collapseForDrag ? 'room-selector-item--drag-collapsed' : ''} ${selected && isDenseRoomLayout ? 'room-selector-item--selected-focus' : ''} ${pendingDelete ? 'room-selector-item--deleting' : ''}`}
      aria-label={`Group ${room.name}`}
      onDragOver={(event) => onRoomDragOver(event, !canManageRooms || isGreenroom)}
      onDrop={(event) => onRoomDrop(event, room.id, !canManageRooms || isGreenroom)}
      onClick={(event) => {
        if (!canManageRooms || isGreenroom || isWhisperRoomGroup || isEmptyTargetableGroup) {
          return
        }

        const target = event.target
        if (!(target instanceof Element)) {
          return
        }

        if (
          target.closest('button, [role="button"], a, input, select, textarea, label') ||
          target.closest('.room-selector-member') ||
          target.closest('.room-selector-item__env-picker')
        ) {
          return
        }

        void onSetDmVoiceRoom(room.id)
      }}
    >
      <div className="room-selector-item__header">
        <span className="room-selector-item-heading-row">
          <button
            type="button"
            className="room-selector-item__select"
            aria-label={`Select group ${room.name}`}
            aria-pressed={selected}
            onClick={() => {
              if (canManageRooms) {
                void onSetDmVoiceRoom(room.id)
                return
              }

              onSelectRoom(room.id)
            }}
          >
            <span className="room-selector-item-name">
              {isWhisperRoomGroup ? (
                <span className="material-symbols-outlined" aria-hidden="true">
                  lock
                </span>
              ) : room.type === RoomType.GROUP ? (
                <span className="material-symbols-outlined" aria-hidden="true">
                  groups
                </span>
              ) : (
                <Icon name="voice" />
              )}
              {getDisplayRoomName(room)}
            </span>
          </button>

          <span className="room-selector-item-actions">
            {!isWhisperRoomGroup && !isGreenroomCard ? (
              <div className="room-selector-item__env-wrap">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="room-selector-item__env-icon"
                      aria-label="Change group environment"
                      data-room-env-trigger={room.id}
                      disabled={isGreenroom}
                      title={
                        isGreenroom
                          ? 'Environment controls are disabled in greenroom'
                          : 'Change group environment'
                      }
                      onClick={() => onToggleEnvironmentPicker(room.id)}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        {resolveEnvironmentGlyph(getResolvedEnvironmentName(room))}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Environment: {getResolvedEnvironmentName(room)}
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : null}

            {canManageRooms && !isGreenroomCard ? (
              <>
                {!isWhisperRoomGroup ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`room-selector-item__icon-action room-selector-item__voice-icon ${
                          broadcastModeEnabled && !whisperModeLocked
                            ? 'is-broadcast'
                            : selectedRoomId === room.id
                              ? 'active'
                              : ''
                        }`}
                        aria-label={`Set DM voice to ${getDisplayRoomName(room)}`}
                        aria-pressed={broadcastModeEnabled || selectedRoomId === room.id}
                        disabled={
                          isGreenroom ||
                          (whisperModeLocked && whisperRoomId ? room.id !== whisperRoomId : false)
                        }
                        onClick={() => {
                          if (isGreenroom) {
                            return
                          }
                          void onSetDmVoiceRoom(room.id)
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          record_voice_over
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isEmptyTargetableGroup
                        ? 'No players detected locally yet. Click to verify with server.'
                        : whisperModeLocked && whisperRoomId && room.id !== whisperRoomId
                          ? 'DM voice target is locked to whisper while whisper is active'
                          : `Set DM voice to ${getDisplayRoomName(room)}`}
                    </TooltipContent>
                  </Tooltip>
                ) : null}

                {room.type !== RoomType.MAIN && (!isWhisperRoomGroup || !isEmptyWhisperGroup) ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className={`room-selector-item__icon-action room-selector-item__close-inline ${
                          !isWhisperRoomGroup && computedHasDetectedPlayers
                            ? 'room-selector-item__close-inline--return'
                            : 'room-selector-item__close-inline--delete'
                        }`}
                        aria-label={`${
                          isWhisperRoomGroup
                            ? 'End whisper'
                            : computedHasDetectedPlayers
                              ? 'Returns players to Main'
                              : 'Delete group'
                        } ${getDisplayRoomName(room)}`}
                        disabled={
                          pendingDelete || (isWhisperRoomGroup && whisperEndBlockedByPendingMoves)
                        }
                        onClick={() => {
                          void onDeleteGroup(room)
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          {isWhisperRoomGroup
                            ? 'exit_to_app'
                            : computedHasDetectedPlayers
                              ? 'reply'
                              : 'delete'}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isWhisperRoomGroup
                        ? whisperEndBlockedByPendingMoves
                          ? 'Waiting for whisper moves to finish'
                          : 'End whisper'
                        : computedHasDetectedPlayers
                          ? 'Close Group'
                          : 'Delete Group'}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </>
            ) : null}
          </span>
        </span>

        {!isWhisperRoomGroup && environmentPickerRoomId === room.id ? (
          <div
            className="room-selector-item__env-picker"
            role="dialog"
            aria-label="Group environment picker"
            ref={environmentPickerLayerRef}
          >
            <p className="room-selector-item__env-picker-title">Choose environment</p>
            <div className="room-selector-item__env-picker-list">
              {GROUP_ENVIRONMENT_OPTIONS.map((option) => {
                const isSelected =
                  getResolvedEnvironmentName(room).toLowerCase() === option.toLowerCase()
                return (
                  <button
                    key={option}
                    type="button"
                    className={isSelected ? 'is-active' : ''}
                    aria-pressed={isSelected}
                    onClick={() => onApplyEnvironment(room.id, option)}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {resolveEnvironmentGlyph(option)}
                    </span>
                    <span>{option}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className={memberListClassName}>
        <GroupMemberList
          room={room}
          participants={participants}
          canManageRooms={canManageRooms}
          isGreenroom={isGreenroom}
          touchFeedbackUserId={touchFeedbackUserId}
          setTouchFeedbackUserId={setTouchFeedbackUserId}
          getParticipantMetaLine={getParticipantMetaLine}
          getResolvedPresenceState={getResolvedPresenceState}
          getPresenceDotState={getPresenceDotState}
          getStatEntries={getStatEntries}
          getResolvedGroupEnvironmentName={getResolvedEnvironmentName}
          distanceTargets={distanceTargets}
          conditionTargets={conditionTargets}
          activeTakeoverUserId={activeTakeoverUserId}
          onApplyDistanceOverride={onApplyDistanceOverride}
          onApplyConditionOverride={onApplyConditionOverride}
          onApplyMuteOverride={onApplyMuteOverride}
          onClearMemberEffects={onClearMemberEffects}
          onTakeOverPlayer={onTakeOverPlayer}
          onMemberDragStart={onMemberDragStart}
          onMemberDragEnd={onMemberDragEnd}
        />
      </div>
    </section>
  )
}
