import { useState } from 'react'
import type {
  LiveKitConnectionState,
  CoreWsState,
  SessionState,
  StatusColorKey,
  UUID,
} from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { toneFromAudioState, toneFromCoreState } from '@/constants/sessionToolbar.constants'
import { Icon } from '@/components/ui/Icon'
import { WorkspaceToolbar } from './WorkspaceToolbar'
import { SessionTimerLeaf } from './SessionTimerLeaf'
import type { ToolbarActionModel } from '@/types/toolbar'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '@/tokens'
import '@/styles/components/workspaces/shared/toolbar/SessionToolbar.css'

interface SessionToolbarProps {
  actions: ToolbarActionModel
  statusColorKey: StatusColorKey
  statusLabel: string
  coreWsState: CoreWsState
  livekitState: LiveKitConnectionState
  sessionId: UUID
  sessionState: SessionState
  cooldownDurationMs?: number
  canStartSession: boolean
  canPauseSession: boolean
  canStopSession: boolean
  showCooldownControls?: boolean
  canManageCooldown?: boolean
  cooldownControlLockedReason?: string
  canExtendCooldown?: boolean
  extendCooldownLockedReason?: string
  onStartSession: () => void
  onPauseSession: () => void
  onStopSession: () => void
  onCancelCooldown?: () => void
  onExtendCooldown?: () => void
  onOpenUserSettings: () => void
  onExitToSelector: () => void
}

export function SessionToolbar({
  actions,
  statusColorKey,
  statusLabel,
  coreWsState,
  livekitState,
  sessionId,
  sessionState,
  cooldownDurationMs,
  canStartSession,
  canPauseSession,
  canStopSession,
  showCooldownControls = false,
  canManageCooldown = false,
  cooldownControlLockedReason,
  canExtendCooldown = false,
  extendCooldownLockedReason,
  onStartSession,
  onPauseSession,
  onStopSession,
  onCancelCooldown,
  onExtendCooldown,
  onOpenUserSettings,
  onExitToSelector,
}: SessionToolbarProps) {
  const storageKey = 'vtt-theme-mode'

  const detectThemeMode = (): FrontendThemeMode => {
    if (typeof document === 'undefined') return 'light'
    return document.documentElement.classList.contains(FRONTEND_THEME_CLASSES.dark)
      ? 'dark'
      : 'light'
  }

  const [themeMode, setThemeMode] = useState<FrontendThemeMode>(detectThemeMode)

  const handleToggleTheme = () => {
    if (typeof document === 'undefined') {
      return
    }

    const nextTheme: FrontendThemeMode = themeMode === 'dark' ? 'light' : 'dark'
    document.documentElement.classList.remove(
      FRONTEND_THEME_CLASSES.light,
      FRONTEND_THEME_CLASSES.dark
    )
    document.documentElement.classList.add(FRONTEND_THEME_CLASSES[nextTheme])
    window.localStorage.setItem(storageKey, nextTheme)
    setThemeMode(nextTheme)
  }

  const pauseLabel = sessionState === 'PAUSED' ? 'Resume after break' : 'Pause for break'
  const pauseIcon = sessionState === 'PAUSED' ? 'play' : 'pause'
  const isCooldownMode = sessionState === 'COOLDOWN'
  const shouldShowStartAction = canStartSession && !isCooldownMode
  const shouldRenderCooldownControls = isCooldownMode && showCooldownControls
  const hasExtraButtons =
    shouldShowStartAction || canStopSession || canPauseSession || shouldRenderCooldownControls

  const coreToneClass = toneFromCoreState(coreWsState)
  const audioToneClass = toneFromAudioState(livekitState)

  const centerContent = (
    <SessionTimerLeaf sessionId={sessionId} cooldownDurationMs={cooldownDurationMs} />
  )

  const sessionActionButtons = hasExtraButtons ? (
    <>
      {shouldShowStartAction ? (
        <button
          type="button"
          onClick={onStartSession}
          className="session-toolbar__action session-toolbar__action--start"
        >
          <Icon name="play" />
          <span>Start</span>
        </button>
      ) : null}

      {shouldRenderCooldownControls ? (
        <span
          className="session-toolbar__split-action session-toolbar__split-action--cooldown"
          role="group"
          aria-label="Cooldown controls"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (!canManageCooldown) return
                  onCancelCooldown?.()
                }}
                className="session-toolbar__split-btn session-toolbar__split-btn--cooldown-cancel"
                aria-label="Cancel cooldown"
                disabled={!canManageCooldown}
              >
                <Icon name="stop" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              {canManageCooldown
                ? 'End cooldown now'
                : cooldownControlLockedReason || 'Cooldown controls are locked'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (!canExtendCooldown) return
                  onExtendCooldown?.()
                }}
                className="session-toolbar__split-btn session-toolbar__split-btn--cooldown-extend"
                aria-label="Extend cooldown"
                disabled={!canExtendCooldown}
              >
                <Icon name="timer" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              {canExtendCooldown
                ? 'Extend cooldown'
                : extendCooldownLockedReason || 'Cooldown extension is locked'}
            </TooltipContent>
          </Tooltip>
        </span>
      ) : null}

      {canStopSession || canPauseSession ? (
        <span className="session-toolbar__split-action" role="group" aria-label="Stop or pause">
          {canStopSession ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onStopSession}
                  className="session-toolbar__split-btn session-toolbar__split-btn--stop"
                  aria-label="End session"
                >
                  <Icon name="stop" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                End session
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="session-toolbar__split-btn session-toolbar__split-btn--placeholder" />
          )}

          {canPauseSession ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onPauseSession}
                  className="session-toolbar__split-btn session-toolbar__split-btn--pause"
                  aria-label={pauseLabel}
                >
                  <Icon name={pauseIcon} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end">
                {pauseLabel}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="session-toolbar__split-btn session-toolbar__split-btn--placeholder" />
          )}
        </span>
      ) : null}
    </>
  ) : undefined

  return (
    <TooltipProvider delayDuration={140}>
      <WorkspaceToolbar
        dataTestId="session-toolbar"
        centerContent={centerContent}
        extraActions={sessionActionButtons}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        onOpenUserSettings={onOpenUserSettings}
        onExit={onExitToSelector}
        exitIcon="logout"
        exitAriaLabel="Exit Session"
        exitTooltipLabel="Exit Session"
        connectionStatusColorKey={statusColorKey}
        connectionStatusLabel={statusLabel}
        connectionStatusRows={[
          { label: 'Core', value: coreWsState, toneClassName: coreToneClass },
          { label: 'Audio', value: livekitState, toneClassName: audioToneClass },
        ]}
      />
    </TooltipProvider>
  )
}
