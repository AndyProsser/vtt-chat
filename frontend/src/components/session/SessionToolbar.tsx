import { useEffect, useMemo, useRef, useState } from 'react'
import type { ToolbarActionModel } from './CommandCenterFrame'
import type { LiveKitConnectionState, CoreWsState, SessionState, StatusColorKey } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { Icon } from '../ui/Icon'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '../../tokens'
import '../../styles/components/session/SessionToolbar.css'

/** Default post-session cooldown window: 5 minutes */
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function formatTimestamp(ms: number | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

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
  onStartSession: () => void
  onPauseSession: () => void
  onStopSession: () => void
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
  onStartSession,
  onPauseSession,
  onStopSession,
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
  const [tick, setTick] = useState(0)
  const [showTimerPopper, setShowTimerPopper] = useState(false)
  const popperRef = useRef<HTMLDivElement>(null)
  const timerBtnRef = useRef<HTMLButtonElement>(null)

  // Track when the user entered the greenroom (local, resets on refresh)
  const greenroomEnteredAtRef = useRef<number>(Date.now())

  // Close popper on outside click
  useEffect(() => {
    if (!showTimerPopper) return
    const handler = (e: MouseEvent) => {
      if (
        popperRef.current &&
        !popperRef.current.contains(e.target as Node) &&
        timerBtnRef.current &&
        !timerBtnRef.current.contains(e.target as Node)
      ) {
        setShowTimerPopper(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showTimerPopper])

  // Tick every second whenever the session is in a state that needs a live clock
  useEffect(() => {
    const needsTick =
      sessionState === 'ACTIVE' ||
      sessionState === 'PAUSED' ||
      sessionState === 'ENDED' ||
      sessionState === 'INACTIVE'
    if (!needsTick) return

    const timer = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [sessionState])

  // ── Timer values ──────────────────────────────────────────────────────────

  const now = Date.now()

  /** Seconds the session has been actively running (pauses excluded). */
  const activeElapsedSeconds = useMemo(() => {
    if (!sessionStartedAt) return 0
    if (sessionState === 'ACTIVE') {
      return Math.max(0, Math.floor((now - sessionStartedAt - cumulativePauseMs) / 1000))
    }
    if (sessionState === 'PAUSED' && sessionPausedAt) {
      return Math.max(
        0,
        Math.floor((sessionPausedAt - sessionStartedAt - cumulativePauseMs) / 1000)
      )
    }
    if ((sessionState === 'ENDED' || sessionState === 'INACTIVE') && sessionEndedAt) {
      return Math.max(0, Math.floor((sessionEndedAt - sessionStartedAt - cumulativePauseMs) / 1000))
    }
    return 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, sessionState, sessionStartedAt, sessionPausedAt, sessionEndedAt, cumulativePauseMs])

  /** Seconds since the current pause began. */
  const pausedElapsedSeconds = useMemo(() => {
    if (sessionState !== 'PAUSED' || !sessionPausedAt) return 0
    return Math.max(0, Math.floor((now - sessionPausedAt) / 1000))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, sessionState, sessionPausedAt])

  /** Seconds remaining in the post-session cooldown window. */
  const cooldownRemainingSeconds = useMemo(() => {
    if (sessionState !== 'ENDED' || !sessionEndedAt) return 0
    return Math.max(0, Math.floor((sessionEndedAt + cooldownDurationMs - now) / 1000))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, sessionState, sessionEndedAt, cooldownDurationMs])

  /** Seconds since the user entered the greenroom (local clock). */
  const greenroomElapsedSeconds = useMemo(() => {
    if (sessionState !== 'INACTIVE') return 0
    return Math.max(0, Math.floor((now - greenroomEnteredAtRef.current) / 1000))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, sessionState])

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
            cooldownRemainingSeconds > 0 ? formatDuration(cooldownRemainingSeconds) : '00:00:00',
          primaryStateClass: 'is-ended',
        }
      case 'INACTIVE':
      default:
        return { primaryLabel: formatDuration(greenroomElapsedSeconds), primaryStateClass: '' }
    }
  }, [
    sessionState,
    activeElapsedSeconds,
    pausedElapsedSeconds,
    cooldownRemainingSeconds,
    greenroomElapsedSeconds,
  ])

  const canShowPopper =
    sessionState === 'ACTIVE' || sessionState === 'PAUSED' || sessionState === 'ENDED'

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
            <div className="session-toolbar__timer-wrap">
              <button
                ref={timerBtnRef}
                type="button"
                className={`session-toolbar__timer-pill ${canShowPopper ? 'session-toolbar__timer-pill--interactive' : ''}`}
                aria-label={`Session timer: ${primaryLabel}. ${canShowPopper ? 'Click for details.' : ''}`}
                aria-expanded={canShowPopper ? showTimerPopper : undefined}
                onClick={canShowPopper ? () => setShowTimerPopper((v) => !v) : undefined}
              >
                <span className="session-toolbar__timer-main">
                  <Icon name={sessionState === 'ENDED' ? 'hourglass' : 'timer'} />
                  <strong>{primaryLabel}</strong>
                </span>
                <span className="session-toolbar__timer-state-wrap">
                  <span className={`session-toolbar__timer-state ${primaryStateClass}`}>
                    {timerStateLabel}
                  </span>
                  {canShowPopper ? (
                    <span className="session-toolbar__timer-chevron" aria-hidden="true">
                      {showTimerPopper ? '▲' : '▼'}
                    </span>
                  ) : null}
                </span>
              </button>

              {canShowPopper && showTimerPopper ? (
                <div
                  ref={popperRef}
                  className="session-toolbar__timer-popper"
                  role="region"
                  aria-label="Session timer details"
                >
                  <div className="session-toolbar__timer-popper-row">
                    <span>Started</span>
                    <strong>{formatTimestamp(sessionStartedAt)}</strong>
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
                      {formatMs(
                        cumulativePauseMs +
                          (sessionState === 'PAUSED' && sessionPausedAt
                            ? Date.now() - sessionPausedAt
                            : 0)
                      )}
                    </strong>
                  </div>
                  <div className="session-toolbar__timer-popper-row">
                    <span>Pauses</span>
                    <strong>{pauseCount + (sessionState === 'PAUSED' ? 1 : 0)}</strong>
                  </div>
                  {sessionState === 'ENDED' ? (
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
