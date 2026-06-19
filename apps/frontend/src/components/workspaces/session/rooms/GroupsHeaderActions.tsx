import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { RoomType } from '@shared'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { CreateGroupModal } from './CreateGroupModal'
import { MockTestingPanel } from '../dev/MockTestingPanel'
import { DmVoicePanel } from './DmVoicePanel'
import { Icon } from '@/components/ui/Icon'

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
  /** Active DM voice preset name, or null when normal voice is active. */
  dmVoicePreset?: string | null
  onBroadcastToggle: () => void
  onDevReset: () => void
  onReturnToUser: () => Promise<void>
  onToggleCreateGroupModal: () => void
  onCloseCreateGroupModal: () => void
  onCreateGroup: (name: string, type: import('@shared').RoomType) => Promise<void>
  onEndWhisper: () => void
  /** Called when DM selects a voice preset (or null to restore normal voice). */
  onSelectVoicePreset?: (presetName: string | null) => void
}

export const GroupsHeaderActions = memo(function GroupsHeaderActions({
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
  dmVoicePreset = null,
  onBroadcastToggle,
  onDevReset,
  onReturnToUser,
  onToggleCreateGroupModal,
  onCloseCreateGroupModal,
  onCreateGroup,
  onEndWhisper,
  onSelectVoicePreset,
}: GroupsHeaderActionsProps) {
  void onDevReset
  const MOCK_PANEL_ANIMATION_MS = 160
  const [showMockPanel, setShowMockPanel] = useState(false)
  const [renderMockPanel, setRenderMockPanel] = useState(false)
  const [mockPanelOpen, setMockPanelOpen] = useState(false)
  const mockPanelRef = useRef<HTMLDivElement | null>(null)
  const takeoverActive = Boolean(activeTakeoverUserId)

  const [showVoicePanel, setShowVoicePanel] = useState(false)
  const [renderVoicePanel, setRenderVoicePanel] = useState(false)
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const voicePanelRef = useRef<HTMLDivElement | null>(null)

  const hasActivePreset = Boolean(dmVoicePreset)

  const closeVoicePanel = useCallback(() => {
    setVoicePanelOpen(false)
    setShowVoicePanel(false)
  }, [])

  const handleVoiceButtonClick = () => {
    if (hasActivePreset && !showVoicePanel) {
      // One-click dismiss: clear the active preset immediately without opening panel
      onSelectVoicePreset?.(null)
      return
    }

    setShowVoicePanel((current) => {
      const next = !current
      if (next) {
        setRenderVoicePanel(true)
        window.requestAnimationFrame(() => {
          setVoicePanelOpen(true)
        })
      } else {
        setVoicePanelOpen(false)
      }
      return next
    })
  }

  const handleSelectVoicePreset = (presetName: string | null) => {
    onSelectVoicePreset?.(presetName)
    closeVoicePanel()
  }

  const closeMockPanel = useCallback(() => {
    setMockPanelOpen(false)
    setShowMockPanel(false)
  }, [])

  const handleToggleMockPanel = () => {
    setShowMockPanel((current) => {
      const next = !current

      if (next) {
        setRenderMockPanel(true)
        window.requestAnimationFrame(() => {
          setMockPanelOpen(true)
        })
      } else {
        setMockPanelOpen(false)
      }

      return next
    })
  }

  useEffect(() => {
    if (showMockPanel) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setRenderMockPanel(false)
    }, MOCK_PANEL_ANIMATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [closeMockPanel, showMockPanel])

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
        closeMockPanel()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMockPanel()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeMockPanel, showMockPanel])

  useEffect(() => {
    if (showVoicePanel) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setRenderVoicePanel(false)
    }, MOCK_PANEL_ANIMATION_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [showVoicePanel])

  useEffect(() => {
    if (!showVoicePanel) {
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (voicePanelRef.current && !voicePanelRef.current.contains(target)) {
        closeVoicePanel()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeVoicePanel()
    }

    document.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeVoicePanel, showVoicePanel])

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
              <Icon name="campaign" />
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
      {canManageRooms && !isGreenroom ? (
        <div className="room-selector-header__voice-wrap" ref={voicePanelRef}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`room-selector-header__broadcast-icon ${
                  hasActivePreset || showVoicePanel ? 'voice-target-active' : ''
                }`}
                aria-label={
                  hasActivePreset
                    ? `Voice preset: ${dmVoicePreset} — tap to restore normal voice`
                    : 'Change DM voice'
                }
                onClick={handleVoiceButtonClick}
                aria-haspopup="dialog"
                aria-expanded={showVoicePanel}
              >
                <Icon name="record_voice_over" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {hasActivePreset
                ? `${dmVoicePreset} — tap to restore normal voice`
                : 'Change DM voice'}
            </TooltipContent>
          </Tooltip>
          {renderVoicePanel ? (
            <div className={`dm-voice-panel-shell ${voicePanelOpen ? 'is-open' : 'is-closing'}`}>
              <DmVoicePanel
                activePreset={dmVoicePreset ?? null}
                onSelect={handleSelectVoicePreset}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {import.meta.env.DEV && canManageRooms ? (
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
                onClick={handleToggleMockPanel}
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
                onClose={closeMockPanel}
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
                <Icon name="group_add" />
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
              <Icon name="exit_to_app" />
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
})

// Legacy compatibility aliases
export { GroupsHeaderActions as RoomHeaderActions }
export type { GroupsHeaderActionsProps as RoomHeaderActionsProps }
