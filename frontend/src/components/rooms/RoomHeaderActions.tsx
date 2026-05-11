import type { RefObject } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../core-ui'
import { CreateGroupModal } from './CreateGroupModal'

interface RoomHeaderActionsProps {
  headerModeCopy?: string
  canManageRooms: boolean
  isGreenroom: boolean
  broadcastModeEnabled: boolean
  whisperModeLocked: boolean
  whisperActive: boolean
  whisperEndBlockedByPendingMoves: boolean
  isDevResettingMocks: boolean
  showCreateGroupControl: boolean
  showCreateGroupModal: boolean
  canCreateGroups: boolean
  createGroupWrapRef: RefObject<HTMLDivElement | null>
  onBroadcastToggle: () => void
  onDevReset: () => void
  onToggleCreateGroupModal: () => void
  onCloseCreateGroupModal: () => void
  onCreateGroup: (name: string, type: import('@shared').RoomType) => Promise<void>
  onEndWhisper: () => void
}

export function RoomHeaderActions({
  headerModeCopy,
  canManageRooms,
  isGreenroom,
  broadcastModeEnabled,
  whisperModeLocked,
  whisperActive,
  whisperEndBlockedByPendingMoves,
  isDevResettingMocks,
  showCreateGroupControl,
  showCreateGroupModal,
  canCreateGroups,
  createGroupWrapRef,
  onBroadcastToggle,
  onDevReset,
  onToggleCreateGroupModal,
  onCloseCreateGroupModal,
  onCreateGroup,
  onEndWhisper,
}: RoomHeaderActionsProps) {
  return (
    <div className="room-selector-header__meta room-selector-header__meta--actions">
      {headerModeCopy ? <span>{headerModeCopy}</span> : null}
      {canManageRooms && !isGreenroom ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`room-selector-header__broadcast-icon ${
                broadcastModeEnabled && !whisperModeLocked ? 'active' : ''
              }`}
              aria-label={broadcastModeEnabled ? 'Disable broadcast mode' : 'Enable broadcast mode'}
              disabled={whisperModeLocked}
              onClick={onBroadcastToggle}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                campaign
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {whisperModeLocked
              ? 'Broadcast locked while whisper is active'
              : broadcastModeEnabled
                ? 'Broadcast enabled (global)'
                : 'Broadcast disabled (global)'}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {canManageRooms && import.meta.env.DEV ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="room-selector-header__broadcast-icon"
              aria-label="Reroll DEV mock players"
              disabled={isDevResettingMocks}
              onClick={onDevReset}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                shuffle
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">Reroll DEV mock players</TooltipContent>
        </Tooltip>
      ) : null}
      {showCreateGroupControl ? (
        <div className="room-selector-header__create-wrap" ref={createGroupWrapRef}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`room-selector-header__create-icon ${showCreateGroupModal ? 'active' : ''}`}
                onClick={onToggleCreateGroupModal}
                disabled={!canCreateGroups}
                aria-label="Create group"
                aria-haspopup="dialog"
                aria-expanded={showCreateGroupModal}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  group_add
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {canCreateGroups ? 'Create group' : 'Create groups in greenroom'}
            </TooltipContent>
          </Tooltip>
          {showCreateGroupModal ? (
            <CreateGroupModal onClose={onCloseCreateGroupModal} onCreateGroup={onCreateGroup} />
          ) : null}
        </div>
      ) : null}
      {canManageRooms && whisperActive ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="room-selector-header__end-whisper"
              onClick={onEndWhisper}
              disabled={whisperEndBlockedByPendingMoves}
              aria-label="End whisper"
              title={
                whisperEndBlockedByPendingMoves
                  ? 'Waiting for whisper moves to finish'
                  : 'End whisper'
              }
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                exit_to_app
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {whisperEndBlockedByPendingMoves
              ? 'Waiting for whisper moves to finish'
              : 'End whisper'}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
