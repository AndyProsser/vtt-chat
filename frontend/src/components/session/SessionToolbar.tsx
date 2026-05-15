import { useEffect, useMemo, useState } from 'react'
import type { ToolbarActionModel } from './CommandCenterFrame'
import type { LiveKitConnectionState, CoreWsState, SessionState, StatusColorKey } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import {
  DEFAULT_COOLDOWN_MS,
  formatDuration,
  formatTimestamp,
  toFiniteTimestamp,
  toneFromAudioState,
  toneFromCoreState,
} from '../../constants/sessionToolbar.constants'
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
  sessionStartedAt?: number
  sessionPausedAt?: number
  sessionEndedAt?: number
  cumulativePauseMs: number
  pauseCount: number
  cooldownDurationMs?: number
  canStartSession: boolean
  canPauseSession: boolean
  canStopSession: boolean
  showCooldownControls?: boolean
  canManageCooldown?: boolean
  cooldownControlLockedReason?: string
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
  sessionState,
  sessionStartedAt,
  sessionPausedAt,
  sessionEndedAt,
  cumulativePauseMs,
  pauseCount,
  cooldownDurationMs = DEFAULT_COOLDOWN_MS,
  canStartSession,
  canPauseSession,
  canStopSession,
  showCooldownControls = false,
  canManageCooldown = false,
  cooldownControlLockedReason,
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
  const [showTimerPopper, setShowTimerPopper] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [greenroomEnteredAtMs, setGreenroomEnteredAtMs] = useState<number | null>(null)

  // Tick every second whenever the session is in a state that needs a live clock
  useEffect(() => {
    const needsTick =
      sessionState === 'ACTIVE' ||
      sessionState === 'PAUSED' ||
      sessionState === 'ENDED' ||
      sessionState === 'IDLE' ||
      sessionState === 'CLEANUP'
    if (!needsTick) return

    const timer = window.setInterval(() => {
      const now = Date.now()
      setCurrentTimeMs(now)
      setGreenroomEnteredAtMs((previous) => {
        if (sessionState !== 'IDLE') {
          return null
        }
        return previous ?? now
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [sessionState])

  // ── Timer values ──────────────────────────────────────────────────────────

  const sessionStartedAtMs = toFiniteTimestamp(sessionStartedAt)
  const sessionPausedAtMs = toFiniteTimestamp(sessionPausedAt)
  const sessionEndedAtMs = toFiniteTimestamp(sessionEndedAt)
  const safeCumulativePauseMs = Number.isFinite(cumulativePauseMs) ? cumulativePauseMs : 0
  const safeCooldownDurationMs = Number.isFinite(cooldownDurationMs)
    ? cooldownDurationMs
    : DEFAULT_COOLDOWN_MS

  /** Seconds the session has been actively running (pauses excluded). */
  const activeElapsedSeconds = useMemo(() => {
    if (!currentTimeMs) return 0
    if (!sessionStartedAtMs) return 0
    if (sessionState === 'ACTIVE') {
      return Math.max(
        0,
        Math.floor((currentTimeMs - sessionStartedAtMs - safeCumulativePauseMs) / 1000)
      )
    }
    if (sessionState === 'PAUSED' && sessionPausedAtMs) {
      return Math.max(
        0,
        Math.floor((sessionPausedAtMs - sessionStartedAtMs - safeCumulativePauseMs) / 1000)
      )
    }
    if (
      (sessionState === 'ENDED' || sessionState === 'CLEANUP' || sessionState === 'IDLE') &&
      sessionEndedAtMs
    ) {
      return Math.max(
        0,
        Math.floor((sessionEndedAtMs - sessionStartedAtMs - safeCumulativePauseMs) / 1000)
      )
    }
    return 0
  }, [
    currentTimeMs,
    sessionState,
    sessionStartedAtMs,
    sessionPausedAtMs,
    sessionEndedAtMs,
    safeCumulativePauseMs,
  ])

  /** Seconds since the current pause began. */
  const pausedElapsedSeconds = useMemo(() => {
    if (!currentTimeMs) return 0
    if (sessionState !== 'PAUSED' || !sessionPausedAtMs) return 0
    return Math.max(0, Math.floor((currentTimeMs - sessionPausedAtMs) / 1000))
  }, [currentTimeMs, sessionState, sessionPausedAtMs])

  /** Seconds remaining in the post-session cooldown window. */
  const cooldownRemainingSeconds = useMemo(() => {
    if (!currentTimeMs) return 0
    if (sessionState !== 'ENDED' || !sessionEndedAtMs) return 0
    return Math.max(
      0,
      Math.floor((sessionEndedAtMs + safeCooldownDurationMs - currentTimeMs) / 1000)
    )
  }, [currentTimeMs, sessionState, sessionEndedAtMs, safeCooldownDurationMs])

  /** Seconds elapsed since cooldown fully expired while still in ENDED state. */
  const endedElapsedSeconds = useMemo(() => {
    if (!currentTimeMs) return 0
    if ((sessionState !== 'ENDED' && sessionState !== 'CLEANUP') || !sessionEndedAtMs) return 0
    const cooldownEndsAt = sessionEndedAtMs + safeCooldownDurationMs
    if (currentTimeMs <= cooldownEndsAt) return 0
    return Math.max(0, Math.floor((currentTimeMs - cooldownEndsAt) / 1000))
  }, [currentTimeMs, sessionState, sessionEndedAtMs, safeCooldownDurationMs])

  /** Seconds since the user entered the greenroom (local clock). */
  const greenroomElapsedSeconds = useMemo(() => {
    if (!currentTimeMs || !greenroomEnteredAtMs) return 0
    if (sessionState !== 'IDLE') return 0
    return Math.max(0, Math.floor((currentTimeMs - greenroomEnteredAtMs) / 1000))
  }, [currentTimeMs, greenroomEnteredAtMs, sessionState])

  // ── Primary timer display ─────────────────────────────────────────────────

  const { primaryLabel, primaryStateClass } = useMemo(() => {
    switch (sessionState) {
      case 'ACTIVE':
        return {
          primaryLabel: formatDuration(activeElapsedSeconds),
          primaryStateClass: 'is-active',
        }
      case 'PAUSED':
        return {
          primaryLabel: formatDuration(pausedElapsedSeconds),
          primaryStateClass: 'is-paused',
        }
      case 'ENDED':
        return {
          primaryLabel:
            cooldownRemainingSeconds > 0
              ? formatDuration(cooldownRemainingSeconds)
              : formatDuration(endedElapsedSeconds),
          primaryStateClass: 'is-ended',
        }
      case 'CLEANUP':
        return {
          primaryLabel: formatDuration(endedElapsedSeconds),
          primaryStateClass: 'is-ended',
        }
      case 'IDLE':
      default:
        return { primaryLabel: formatDuration(greenroomElapsedSeconds), primaryStateClass: '' }
    }
  }, [
    sessionState,
    activeElapsedSeconds,
    pausedElapsedSeconds,
    cooldownRemainingSeconds,
    endedElapsedSeconds,
    greenroomElapsedSeconds,
  ])

  const canShowPopper =
    sessionState === 'ACTIVE' ||
    sessionState === 'PAUSED' ||
    sessionState === 'ENDED' ||
    sessionState === 'CLEANUP'

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
  const isCooldownMode = sessionState === 'ENDED' && cooldownRemainingSeconds > 0
  const shouldRenderCooldownControls = isCooldownMode && showCooldownControls
  const hasExtraButtons =
    canStartSession || canStopSession || canPauseSession || shouldRenderCooldownControls

  const coreToneClass = toneFromCoreState(coreWsState)
  const audioToneClass = toneFromAudioState(livekitState)

  // Timer state label text
  const timerStateLabel =
    sessionState === 'ENDED' ? (cooldownRemainingSeconds > 0 ? 'COOLDOWN' : 'ENDED') : sessionState

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
            <div
              className="session-toolbar__timer-wrap"
              onMouseEnter={canShowPopper ? () => setShowTimerPopper(true) : undefined}
              onMouseLeave={canShowPopper ? () => setShowTimerPopper(false) : undefined}
              onFocus={canShowPopper ? () => setShowTimerPopper(true) : undefined}
              onBlur={
                canShowPopper
                  ? (event) => {
                      const nextTarget = event.relatedTarget as Node | null
                      if (!event.currentTarget.contains(nextTarget)) {
                        setShowTimerPopper(false)
                      }
                    }
                  : undefined
              }
            >
              <button
                type="button"
                className={`session-toolbar__timer-pill ${canShowPopper ? 'session-toolbar__timer-pill--interactive' : ''}`}
                aria-label={`Session timer: ${primaryLabel}. ${canShowPopper ? 'Hover for details.' : ''}`}
                aria-expanded={canShowPopper ? showTimerPopper : undefined}
              >
                <span className="session-toolbar__timer-main">
                  <Icon name={sessionState === 'ENDED' ? 'hourglass' : 'timer'} />
                  <strong>{primaryLabel}</strong>
                </span>
                <span className="session-toolbar__timer-state-wrap">
                  <span className={`session-toolbar__timer-state ${primaryStateClass}`}>
                    {timerStateLabel}
                  </span>
                </span>
              </button>

              {canShowPopper && showTimerPopper ? (
                <div
                  className="session-toolbar__timer-popper"
                  role="region"
                  aria-label="Session timer details"
                >
                  <div className="session-toolbar__timer-popper-row">
                    <span>Started</span>
                    <strong>{formatTimestamp(sessionStartedAtMs)}</strong>
                  </div>
                  <div className="session-toolbar__timer-popper-row">
                    <span>Active time</span>
                    <strong>{formatDuration(activeElapsedSeconds)}</strong>
                  </div>
                  {sessionState === 'PAUSED' ? (
                    <div className="session-toolbar__timer-popper-row session-toolbar__timer-popper-row--highlight">
                      <span>Paused for</span>
                      <strong>{formatDuration(pausedElapsedSeconds)}</strong>
                    </div>
                  ) : null}
                  <div className="session-toolbar__timer-popper-row">
                    <span>Total pause time</span>
                    <strong>
                      {formatDuration(
                        Math.floor(
                          (cumulativePauseMs +
                            (sessionState === 'PAUSED' && sessionPausedAtMs
                              ? currentTimeMs - sessionPausedAtMs
                              : 0)) /
                            1000
                        )
                      )}
                    </strong>
                  </div>
                  <div className="session-toolbar__timer-popper-row">
                    <span>Times paused</span>
                    <strong>{pauseCount}</strong>
                  </div>
                  {sessionState === 'ENDED' || sessionState === 'CLEANUP' ? (
                    <div className="session-toolbar__timer-popper-row session-toolbar__timer-popper-row--ended">
                      <span>Cooldown left</span>
                      <strong>
                        {cooldownRemainingSeconds > 0
                          ? formatDuration(cooldownRemainingSeconds)
                          : 'Expired'}
                      </strong>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
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
                    disabled={shouldRenderCooldownControls}
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
                          <span>Cancel</span>
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
                            if (!canManageCooldown) return
                            onExtendCooldown?.()
                          }}
                          className="session-toolbar__split-btn session-toolbar__split-btn--cooldown-extend"
                          aria-label="Extend cooldown"
                          disabled={!canManageCooldown}
                        >
                          <Icon name="timer" />
                          <span>Extend</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="end">
                        {canManageCooldown
                          ? 'Add one more cooldown block'
                          : cooldownControlLockedReason || 'Cooldown controls are locked'}
                      </TooltipContent>
                    </Tooltip>
                  </span>
                ) : null}

                {canStopSession || canPauseSession ? (
                  <span
                    className="session-toolbar__split-action"
                    role="group"
                    aria-label="Stop or pause"
                  >
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
                onClick={onOpenUserSettings}
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
