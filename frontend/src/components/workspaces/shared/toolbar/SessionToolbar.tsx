import { useEffect, useMemo, useState } from 'react'
import type { ToolbarActionModel } from './SessionWorkspaceFrame'
import type { LiveKitConnectionState, CoreWsState, SessionState, StatusColorKey } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import {
  DEFAULT_COOLDOWN_MS,
  formatDuration,
  formatTimestamp,
  toFiniteTimestamp,
  toneFromAudioState,
  toneFromCoreState,
} from '@/constants/sessionToolbar.constants'
import { Icon } from '@/components/ui/Icon'
import { WorkspaceTopbar } from './WorkspaceTopbar'
import { FRONTEND_THEME_CLASSES, type FrontendThemeMode } from '@/tokens'
import '@/styles/components/session/SessionToolbar.css'

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
  cooldownEndsAt?: number
  cumulativePauseMs: number
  pauseCount: number
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
  sessionState,
  sessionStartedAt,
  sessionPausedAt,
  sessionEndedAt,
  cooldownEndsAt,
  cumulativePauseMs,
  pauseCount,
  cooldownDurationMs = DEFAULT_COOLDOWN_MS,
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
  const [showTimerPopper, setShowTimerPopper] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [greenroomEnteredAtMs, setGreenroomEnteredAtMs] = useState<number | null>(null)

  // Tick every second whenever the session is in a state that needs a live clock
  useEffect(() => {
    const needsTick =
      sessionState === 'ACTIVE' ||
      sessionState === 'PAUSED' ||
      sessionState === 'COOLDOWN' ||
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
  const cooldownEndsAtMs = toFiniteTimestamp(cooldownEndsAt)
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
      (sessionState === 'COOLDOWN' ||
        sessionState === 'ENDED' ||
        sessionState === 'CLEANUP' ||
        sessionState === 'IDLE') &&
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
    if (sessionState !== 'COOLDOWN') return 0

    const resolvedCooldownEndsAtMs =
      cooldownEndsAtMs ?? (sessionEndedAtMs ? sessionEndedAtMs + safeCooldownDurationMs : undefined)

    if (!resolvedCooldownEndsAtMs) return 0

    return Math.max(0, Math.floor((resolvedCooldownEndsAtMs - currentTimeMs) / 1000))
  }, [currentTimeMs, sessionState, cooldownEndsAtMs, sessionEndedAtMs, safeCooldownDurationMs])

  /** Seconds elapsed since the session entered ENDED/CLEANUP state. */
  const endedElapsedSeconds = useMemo(() => {
    if (!currentTimeMs) return 0
    if ((sessionState !== 'ENDED' && sessionState !== 'CLEANUP') || !sessionEndedAtMs) return 0
    return Math.max(0, Math.floor((currentTimeMs - sessionEndedAtMs) / 1000))
  }, [currentTimeMs, sessionState, sessionEndedAtMs])

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
      case 'COOLDOWN':
        return {
          primaryLabel: formatDuration(cooldownRemainingSeconds),
          primaryStateClass: 'is-ended',
        }
      case 'ENDED':
        return { primaryLabel: formatDuration(endedElapsedSeconds), primaryStateClass: '' }
      case 'CLEANUP':
        return {
          primaryLabel: formatDuration(endedElapsedSeconds),
          primaryStateClass: '',
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
    sessionState === 'COOLDOWN' ||
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
  const isCooldownMode = sessionState === 'COOLDOWN'
  const shouldShowStartAction = canStartSession && !isCooldownMode
  const shouldRenderCooldownControls = isCooldownMode && showCooldownControls
  const hasExtraButtons =
    shouldShowStartAction || canStopSession || canPauseSession || shouldRenderCooldownControls

  const coreToneClass = toneFromCoreState(coreWsState)
  const audioToneClass = toneFromAudioState(livekitState)

  // Timer state label text
  const timerStateLabel = sessionState

  const centerContent = (
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
            <Icon name={sessionState === 'COOLDOWN' ? 'hourglass' : 'timer'} />
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
            {sessionState === 'COOLDOWN' ? (
              <div className="session-toolbar__timer-popper-row session-toolbar__timer-popper-row--ended">
                <span>Cooldown left</span>
                <strong>{formatDuration(cooldownRemainingSeconds)}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
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
      <WorkspaceTopbar
        dataTestId="session-toolbar"
        centerContent={centerContent}
        extraActions={sessionActionButtons}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        onOpenUserSettings={onOpenUserSettings}
        onExit={onExitToSelector}
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
