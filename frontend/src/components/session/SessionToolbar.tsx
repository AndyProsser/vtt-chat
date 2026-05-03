import { useEffect, useMemo, useState } from 'react'
import type { ToolbarActionModel } from './CommandCenterFrame'
import type { Role, SessionState } from '@shared'
import type { ConnectionState } from '../../ws/client'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { Icon } from '../ui/Icon'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '../../tokens'
import '../../styles/components/session/SessionToolbar.css'

interface SessionToolbarProps {
  actions: ToolbarActionModel
  campaignName: string
  role: Role
  wsState: ConnectionState
  sessionState: SessionState
  canStartSession: boolean
  canStopSession: boolean
  onStartSession: () => void
  onStopSession: () => void
  onExitToSelector: () => void
}

export function SessionToolbar({
  actions,
  campaignName,
  role,
  wsState,
  sessionState,
  canStartSession,
  canStopSession,
  onStartSession,
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
    const targetTab = actions.availableRightRailTabs.includes('notes') ? 'notes' : 'rooms'

    if (actions.rightRailOpen && actions.activeRightRailTab === targetTab) {
      actions.toggleRightRail()
      return
    }

    actions.openRightRailTab(targetTab)
  }

  const wsStateLabel = wsState.charAt(0).toUpperCase() + wsState.slice(1)

  return (
    <TooltipProvider delayDuration={140}>
      <div className="session-toolbar" data-testid="session-toolbar">
        <div className="session-toolbar__zone session-toolbar__zone--left">
          <div className="session-toolbar__brand" aria-label="Title and campaign">
            <span className="session-toolbar__brand-mark" aria-hidden="true">
              <img src="/branding/app-logo.png" alt="" className="session-toolbar__brand-logo" />
            </span>
            <strong className="session-toolbar__brand-title">VTT Chat</strong>
          </div>
          <span className="session-toolbar__campaign-pill">
            <Icon name="rooms" />
            <span>{campaignName}</span>
          </span>
        </div>

        <div className="session-toolbar__zone session-toolbar__zone--center">
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

          {canStopSession ? (
            <button
              type="button"
              onClick={onStopSession}
              className="session-toolbar__action session-toolbar__action--stop"
            >
              <Icon name="stop" />
              <span>Stop</span>
            </button>
          ) : null}

          {!canStartSession && !canStopSession ? (
            <span className="session-toolbar__status-pill">
              <Icon name="users" />
              <span>{role}</span>
            </span>
          ) : null}

          <span className="session-toolbar__timer-pill" aria-label="Session timer">
            <Icon name="timer" />
            <strong>{timerLabel}</strong>
            <span className="session-toolbar__timer-state">{sessionState}</span>
          </span>
        </div>

        <div className="session-toolbar__zone session-toolbar__zone--right">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggleTheme}
                className="session-toolbar__icon-btn"
                aria-label="Toggle theme"
                title="Toggle theme"
              >
                <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Toggle theme</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="session-toolbar__icon-btn"
                aria-label="Open settings"
                title="Open settings"
              >
                <Icon name="settings" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Open notes workspace</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`session-toolbar__connection session-toolbar__connection--${wsState}`}
                aria-label={`Connection ${wsStateLabel}`}
                role="status"
              >
                <Icon name="status" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{wsStateLabel}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onExitToSelector}
                className="session-toolbar__icon-btn session-toolbar__icon-btn--exit"
                aria-label="Exit to campaign selector"
                title="Exit to campaign selector"
              >
                <Icon name="logout" />
                <span className="session-toolbar__exit-label">Exit</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Exit to campaign selector</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
