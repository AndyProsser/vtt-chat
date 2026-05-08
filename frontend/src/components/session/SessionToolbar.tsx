import { useEffect, useMemo, useState } from 'react'
import type { ToolbarActionModel } from './CommandCenterFrame'
import type { LiveKitConnectionState, CoreWsState, SessionState, StatusColorKey } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { Icon } from '../ui/Icon'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '../../tokens'
import '../../styles/components/session/SessionToolbar.css'

interface SessionToolbarProps {
  actions: ToolbarActionModel
  statusColorKey: StatusColorKey
  statusLabel: string
  coreWsState: CoreWsState
  livekitState: LiveKitConnectionState
  sessionState: SessionState
  canStartSession: boolean
  canPauseSession: boolean
  canStopSession: boolean
  onStartSession: () => void
  onPauseSession: () => void
  onStopSession: () => void
  onExitToSelector: () => void
}

export function SessionToolbar({
  actions,
  statusColorKey,
  statusLabel,
  coreWsState,
  livekitState,
  sessionState,
  canStartSession,
  canPauseSession,
  canStopSession,
  onStartSession,
  onPauseSession,
  onStopSession,
  onExitToSelector,
}: SessionToolbarProps) {
  const storageKey = 'vtt-theme-mode'

  const detectThemeMode = (): FrontendThemeMode => {
    if (typeof document === 'undefined') {
      return 'light'
    }

    return document.documentElement.classList.contains(FRONTEND_THEME_CLASSES.dark)
      ? 'dark'
      : 'light'
  }

  const [themeMode, setThemeMode] = useState<FrontendThemeMode>(detectThemeMode)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (sessionState !== 'ACTIVE') {
      return
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1)
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [sessionState])

  const timerLabel = useMemo(() => {
    const hours = Math.floor(elapsedSeconds / 3600)
    const minutes = Math.floor((elapsedSeconds % 3600) / 60)
    const seconds = elapsedSeconds % 60

    const hh = String(hours).padStart(2, '0')
    const mm = String(minutes).padStart(2, '0')
    const ss = String(seconds).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }, [elapsedSeconds])

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

  const handleOpenSettings = () => {
    const targetTab = actions.availableRightRailTabs.includes('settings') ? 'settings' : 'rooms'

    if (actions.rightRailOpen && actions.activeRightRailTab === targetTab) {
      actions.toggleRightRail()
      return
    }

    actions.openRightRailTab(targetTab)
  }

  const handleOpenInformation = () => {
    const targetTab = actions.availableRightRailTabs.includes('notes') ? 'notes' : 'search'

    if (actions.rightRailOpen && actions.activeRightRailTab === targetTab) {
      actions.toggleRightRail()
      return
    }

    actions.openRightRailTab(targetTab)
  }

  const pauseLabel = sessionState === 'PAUSED' ? 'Resume after break' : 'Pause for break'
  const pauseIcon = sessionState === 'PAUSED' ? 'play' : 'pause'
  const hasExtraButtons = canStartSession || canStopSession || canPauseSession

  const toneFromCoreState = (value: CoreWsState): 'is-green' | 'is-yellow' | 'is-red' => {
    if (value === 'CONNECTED') return 'is-green'
    if (value === 'CONNECTING') return 'is-yellow'
    return 'is-red'
  }

  const toneFromAudioState = (
    value: LiveKitConnectionState
  ): 'is-green' | 'is-yellow' | 'is-red' => {
    if (value === 'CONNECTED') return 'is-green'
    if (value === 'CONNECTING' || value === 'NOT_APPLICABLE') return 'is-yellow'
    return 'is-red'
  }

  const coreToneClass = toneFromCoreState(coreWsState)
  const audioToneClass = toneFromAudioState(livekitState)

  return (
    <TooltipProvider delayDuration={140}>
      <div className="session-toolbar" data-testid="session-toolbar">
        <div className="session-toolbar__zone session-toolbar__zone--left">
          <div className="session-toolbar__brand" aria-label="App brand">
            <span className="session-toolbar__brand-mark" aria-hidden="true">
              <img src="/branding/app-logo.png" alt="" className="session-toolbar__brand-logo" />
            </span>
            <strong className="session-toolbar__brand-title">VTT Chat</strong>
          </div>
        </div>

        <div className="session-toolbar__zone session-toolbar__zone--center">
          <div className="session-toolbar__timer-group">
            <span className="session-toolbar__timer-pill" aria-label="Session timer">
              <span className="session-toolbar__timer-main">
                <Icon name="timer" />
                <strong>{timerLabel}</strong>
              </span>
              <span className="session-toolbar__timer-state-wrap">
                <span
                  className={`session-toolbar__timer-state ${
                    sessionState === 'ACTIVE'
                      ? 'is-active'
                      : sessionState === 'PAUSED'
                        ? 'is-paused'
                        : ''
                  }`}
                >
                  {sessionState}
                </span>
              </span>
            </span>
          </div>
        </div>

        <div className="session-toolbar__zone session-toolbar__zone--right">
          {hasExtraButtons ? (
            <>
              <div className="session-toolbar__extra-buttons" aria-label="Session actions">
                {canStartSession ? (
                  <button
                    type="button"
                    onClick={onStartSession}
                    className="session-toolbar__action session-toolbar__action--start"
                  >
                    <Icon name="play" />
                    <span>Start</span>
                  </button>
                ) : null}

                {canStopSession || canPauseSession ? (
                  <span
                    className="session-toolbar__split-action"
                    role="group"
                    aria-label="Stop or pause"
                  >
                    {canStopSession ? (
                      <button
                        type="button"
                        onClick={onStopSession}
                        className="session-toolbar__split-btn session-toolbar__split-btn--stop"
                        aria-label="End session"
                        title="End session"
                      >
                        <Icon name="stop" />
                      </button>
                    ) : (
                      <span className="session-toolbar__split-btn session-toolbar__split-btn--placeholder" />
                    )}

                    {canPauseSession ? (
                      <button
                        type="button"
                        onClick={onPauseSession}
                        className="session-toolbar__split-btn session-toolbar__split-btn--pause"
                        aria-label={pauseLabel}
                        title={pauseLabel}
                      >
                        <Icon name={pauseIcon} />
                      </button>
                    ) : (
                      <span className="session-toolbar__split-btn session-toolbar__split-btn--placeholder" />
                    )}
                  </span>
                ) : null}
              </div>

              <span className="session-toolbar__separator" aria-hidden="true" />
            </>
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggleTheme}
                className="session-toolbar__icon-btn"
                aria-label="Theme"
              >
                <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Theme
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="session-toolbar__icon-btn"
                aria-label="Settings"
              >
                <Icon name="settings" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Settings
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleOpenInformation}
                className="session-toolbar__icon-btn"
                aria-label="Information"
              >
                <Icon name="panel" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Information
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onExitToSelector}
                className="session-toolbar__icon-btn session-toolbar__icon-btn--exit"
                aria-label="Exit Session"
              >
                <Icon name="logout" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Exit Session
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="session-toolbar__connection"
                data-status-color={statusColorKey}
                aria-label={`Connection: ${statusLabel}`}
                role="status"
              >
                <span className="session-toolbar__connection-dot" aria-hidden="true" />
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="end"
              className="session-toolbar__tooltip-content--status"
            >
              <div className="session-toolbar__status-tooltip-title">Status</div>
              <div className="session-toolbar__status-tooltip-row">
                <span>Core</span>
                <strong className={coreToneClass}>{coreWsState}</strong>
              </div>
              <div className="session-toolbar__status-tooltip-row">
                <span>Audio</span>
                <strong className={audioToneClass}>{livekitState}</strong>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
