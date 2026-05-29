import { SessionState } from '@shared'
import { useEffect, useState } from 'react'
import { SPECTATOR_WAIT_SCREEN_COPY } from '@/constants/sessionUi.constants'
import '@/styles/components/workspaces/session/SpectatorWaitScreen.css'

interface SpectatorWaitScreenProps {
  /** Current session state */
  sessionState: SessionState
  /** Timestamp (ms) when the session ended — used to compute cooldown countdown */
  sessionEndedAt?: number
  /** Configured cooldown duration in ms (e.g., 300000 for 5 min) */
  cooldownDurationMs?: number
}

function computeRemaining(
  sessionEndedAt: number | undefined,
  cooldownDurationMs: number,
  nowMs: number
): number {
  if (!sessionEndedAt || sessionEndedAt === 0) return 0
  return Math.max(0, sessionEndedAt + cooldownDurationMs - nowMs)
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * SpectatorWaitScreen
 *
 * Shown to spectators when they cannot observe the live session:
 * - IDLE: session has not started yet.
 * - PAUSED: session is on intermission (curtain down).
 * - COOLDOWN: post-session cooldown window is active.
 * - ENDED/CLEANUP: post-session lifecycle has concluded.
 *
 * Contract:
 * - IDLE/PAUSED → spectators see a "Please Wait" hold screen.
 * - COOLDOWN → spectators see a countdown and the message that
 *   post-session chat is open (they can use the chat panel below/alongside this).
 * - ENDED/CLEANUP → "Session Closed" message.
 */
export function SpectatorWaitScreen({
  sessionState,
  sessionEndedAt,
  cooldownDurationMs = 300_000,
}: SpectatorWaitScreenProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const remainingMs = computeRemaining(sessionEndedAt, cooldownDurationMs, nowMs)

  useEffect(() => {
    if (sessionState !== SessionState.COOLDOWN) {
      return
    }

    setNowMs(Date.now())

    if (!sessionEndedAt || sessionEndedAt === 0 || cooldownDurationMs <= 0) {
      return
    }

    const expiresAtMs = sessionEndedAt + cooldownDurationMs
    const remaining = expiresAtMs - Date.now()

    if (remaining <= 0) {
      setNowMs(Date.now())
      return
    }

    const timeoutId = window.setTimeout(() => {
      setNowMs(Date.now())
    }, remaining)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [cooldownDurationMs, sessionEndedAt, sessionState])

  if (sessionState === SessionState.IDLE || sessionState === SessionState.PAUSED) {
    return (
      <div className="spectator-wait-screen" role="status" aria-live="polite">
        <div className="spectator-wait-screen__icon" aria-hidden="true">
          <span className="material-symbols-outlined">theaters</span>
        </div>
        <h2 className="spectator-wait-screen__title">
          {SPECTATOR_WAIT_SCREEN_COPY[sessionState === SessionState.IDLE ? 'idle' : 'paused'].title}
        </h2>
        <p className="spectator-wait-screen__body">
          {sessionState === SessionState.IDLE
            ? SPECTATOR_WAIT_SCREEN_COPY.idle.body
            : SPECTATOR_WAIT_SCREEN_COPY.paused.body}
        </p>
      </div>
    )
  }

  if (sessionState === SessionState.COOLDOWN) {
    return (
      <div
        className="spectator-wait-screen spectator-wait-screen--cooldown"
        role="status"
        aria-live="polite"
      >
        <div className="spectator-wait-screen__icon" aria-hidden="true">
          <span className="material-symbols-outlined">celebration</span>
        </div>
        <h2 className="spectator-wait-screen__title">
          {SPECTATOR_WAIT_SCREEN_COPY.cooldown.title}
        </h2>
        <p className="spectator-wait-screen__body">
          {SPECTATOR_WAIT_SCREEN_COPY.cooldown.bodyPrefix}{' '}
          <span
            className="spectator-wait-screen__countdown"
            aria-label={`${formatCountdown(remainingMs)} ${SPECTATOR_WAIT_SCREEN_COPY.cooldown.countdownSuffix}`}
          >
            {formatCountdown(remainingMs)}
          </span>
        </p>
        <p className="spectator-wait-screen__hint">{SPECTATOR_WAIT_SCREEN_COPY.cooldown.hint}</p>
      </div>
    )
  }

  if (sessionState === SessionState.ENDED || sessionState === SessionState.CLEANUP) {
    return (
      <div
        className="spectator-wait-screen spectator-wait-screen--ended"
        role="status"
        aria-live="polite"
      >
        <div className="spectator-wait-screen__icon" aria-hidden="true">
          <span className="material-symbols-outlined">history</span>
        </div>
        <h2 className="spectator-wait-screen__title">{SPECTATOR_WAIT_SCREEN_COPY.ended.title}</h2>
        <p className="spectator-wait-screen__body">{SPECTATOR_WAIT_SCREEN_COPY.ended.body}</p>
      </div>
    )
  }

  return null
}
