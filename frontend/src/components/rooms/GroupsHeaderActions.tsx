import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../core-ui'
import { CreateGroupModal } from './CreateGroupModal'
import { MockTestingPanel } from '../dev/MockTestingPanel'

export interface GroupsHeaderActionsProps {
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
  apiUrl?: string
  token?: string
  sessionId?: UUID
  activeTakeoverUserId?: UUID | null
  onBroadcastToggle: () => void
  onDevReset: () => void
  onReturnToUser: () => Promise<void>
  onToggleCreateGroupModal: () => void
  onCloseCreateGroupModal: () => void
  onCreateGroup: (name: string, type: import('@shared').RoomType) => Promise<void>
  onEndWhisper: () => void
}

export function GroupsHeaderActions({
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
  apiUrl,
  token,
  sessionId,
  activeTakeoverUserId,
  onBroadcastToggle,
  onDevReset,
  onReturnToUser,
  onToggleCreateGroupModal,
  onCloseCreateGroupModal,
  onCreateGroup,
  onEndWhisper,
}: GroupsHeaderActionsProps) {
  void onDevReset
  const MOCK_PANEL_ANIMATION_MS = 160
  const [showMockPanel, setShowMockPanel] = useState(false)
  const [renderMockPanel, setRenderMockPanel] = useState(false)
  const [mockPanelOpen, setMockPanelOpen] = useState(false)
  const mockPanelRef = useRef<HTMLDivElement | null>(null)
  const takeoverActive = Boolean(activeTakeoverUserId)

  useEffect(() => {
    if (showMockPanel) {
      setRenderMockPanel(true)
      const rafId = window.requestAnimationFrame(() => {
        setMockPanelOpen(true)
      })

      return () => {
        window.cancelAnimationFrame(rafId)
      }
    }

    setMockPanelOpen(false)
    const timeoutId = window.setTimeout(() => {
      setRenderMockPanel(false)
    }, MOCK_PANEL_ANIMATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [showMockPanel])

  useEffect(() => {
    if (!showMockPanel) {
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      if (mockPanelRef.current && !mockPanelRef.current.contains(target)) {
        setShowMockPanel(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMockPanel(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showMockPanel])

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
      {import.meta.env.DEV && (canManageRooms || takeoverActive) ? (
        <div className="room-selector-header__mock-wrap" ref={mockPanelRef}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`room-selector-header__broadcast-icon ${showMockPanel ? 'active' : ''} ${takeoverActive ? 'takeover-active' : ''}`}
                aria-label={
                  takeoverActive
                    ? 'Mock takeover active — open controls to return'
                    : 'Configure mock testing'
                }
                disabled={isDevResettingMocks}
                onClick={() => setShowMockPanel((current) => !current)}
                aria-haspopup="dialog"
                aria-expanded={showMockPanel}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {takeoverActive ? 'exit_to_app' : 'shuffle'}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {takeoverActive
                ? 'DEV: Takeover active — open to return to your user'
                : 'DEV: Configure mock testing'}
            </TooltipContent>
          </Tooltip>
          {renderMockPanel && apiUrl && token && sessionId ? (
            <div className={`mock-testing-panel-shell ${mockPanelOpen ? 'is-open' : 'is-closing'}`}>
              <MockTestingPanel
                apiUrl={apiUrl}
                token={token}
                sessionId={sessionId}
                activeTakeoverUserId={activeTakeoverUserId}
                onReturnToUser={onReturnToUser}
                onClose={() => setShowMockPanel(false)}
              />
            </div>
          ) : null}
        </div>
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

// Legacy compatibility aliases
export { GroupsHeaderActions as RoomHeaderActions }
export type { GroupsHeaderActionsProps as RoomHeaderActionsProps }
