/**
 * SessionTimerLeaf
 *
 * Leaf-isolated, self-ticking session timer pill + popper.
 *
 * Why a leaf?  The timer ticks every second when ACTIVE or PAUSED.  Embedding
 * that clock inside SessionToolbar caused the entire toolbar tree — including
 * the Radix TooltipProvider, every action button, and their Popper subtrees —
 * to re-render on each tick.  By isolating the clock here, re-renders are
 * confined to this one component.
 *
 * Design contract:
 * - Accepts only `{ sessionId, cooldownDurationMs? }` — both are stable across
 *   session lifetime (no transient values as props).
 * - Reads all timing-anchor data from Zustand via a custom-equality selector.
 *   The anchor only changes on server-driven state events; it never changes on
 *   clock ticks.
 * - Manages its own `currentTimeMs` via useState + interval / one-shot timeout.
 * - ACTIVE / PAUSED  → 1-second setInterval
 * - COOLDOWN         → single setTimeout to the expiry moment
 * - All other states → no timer (static display)
 * - The popper content is rendered inline here so it never causes the parent
 *   toolbar to re-render when it opens or ticks.
 */

import { memo, useState, useEffect, useRef } from 'react'
import type { UUID } from '@shared'
import { useStore } from '@/state/store'
import {
  DEFAULT_COOLDOWN_MS,
  formatDuration,
  formatTimestamp,
  toFiniteTimestamp,
} from '@/constants/sessionToolbar.constants'
import { Icon } from '@/components/ui/Icon'

// ── Zustand anchor ────────────────────────────────────────────────────────────
// All fields are backend-authoritative timestamps / counters.  They change only
// when a server WS event arrives — never on clock ticks.

interface SessionTimerAnchor {
  state: string
  createdAt: number | undefined
  startedAt: number | undefined
  pausedAt: number | undefined
  endedAt: number | undefined
  cooldownExpiresAt: number | undefined
  cumulativePauseMs: number
  pauseCount: number
  pauseStartedAt: number | undefined
}

const EMPTY_ANCHOR: SessionTimerAnchor = {
  state: 'IDLE',
  createdAt: undefined,
  startedAt: undefined,
  pausedAt: undefined,
  endedAt: undefined,
  cooldownExpiresAt: undefined,
  cumulativePauseMs: 0,
  pauseCount: 0,
  pauseStartedAt: undefined,
}

/** Field-level equality so `Object.is` on the returned object doesn't invalidate on every store write. */
function anchorEqual(a: SessionTimerAnchor, b: SessionTimerAnchor): boolean {
  return (
    a.state === b.state &&
    a.createdAt === b.createdAt &&
    a.startedAt === b.startedAt &&
    a.pausedAt === b.pausedAt &&
    a.endedAt === b.endedAt &&
    a.cooldownExpiresAt === b.cooldownExpiresAt &&
    a.cumulativePauseMs === b.cumulativePauseMs &&
    a.pauseCount === b.pauseCount &&
    a.pauseStartedAt === b.pauseStartedAt
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface SessionTimerLeafProps {
  sessionId: UUID
  /** Campaign-configured post-session cooldown window. Falls back to DEFAULT_COOLDOWN_MS. */
  cooldownDurationMs?: number
}

function SessionTimerLeafInner({
  sessionId,
  cooldownDurationMs = DEFAULT_COOLDOWN_MS,
}: SessionTimerLeafProps) {
  // Cache the last anchor snapshot so the selector always returns a stable
  // reference when field values are unchanged.  React's useSyncExternalStore
  // (used internally by Zustand) calls getSnapshot multiple times per render
  // and expects Object.is-stable results — creating a new object literal each
  // call causes the "getSnapshot should be cached" infinite loop error.
  const anchorCacheRef = useRef<SessionTimerAnchor>(EMPTY_ANCHOR)

  const anchor = useStore((state) => {
    const sessions = state.sessions as Record<string, (typeof state.sessions)[UUID]>
    const pauseStats = state.pauseStats as Record<string, (typeof state.pauseStats)[UUID]>
    const session = sessions[sessionId]
    const stats = pauseStats[sessionId]

    if (!session) {
      // Return the same EMPTY_ANCHOR constant — always the same reference.
      if (anchorCacheRef.current === EMPTY_ANCHOR) return EMPTY_ANCHOR
      anchorCacheRef.current = EMPTY_ANCHOR
      return EMPTY_ANCHOR
    }

    const next: SessionTimerAnchor = {
      state: session.state as string,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      pausedAt: session.pausedAt,
      endedAt: session.endedAt,
      cooldownExpiresAt: session.cooldownExpiresAt,
      cumulativePauseMs: stats?.cumulativePauseMs ?? 0,
      pauseCount: stats?.pauseCount ?? 0,
      pauseStartedAt: stats?.pauseStartedAt,
    }

    // Return cached reference when fields haven't changed — this keeps
    // getSnapshot stable across repeated calls within the same render.
    if (anchorEqual(anchorCacheRef.current, next)) return anchorCacheRef.current

    anchorCacheRef.current = next
    return next
  })

  // Local clock — only this leaf re-renders when it ticks.
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now())
  const [showPopper, setShowPopper] = useState(false)

  // Clock driver: interval for live states, one-shot for COOLDOWN, nothing otherwise.
  useEffect(() => {
    if (anchor.state === 'ACTIVE' || anchor.state === 'PAUSED' || anchor.state === 'IDLE') {
      const id = window.setInterval(() => setCurrentTimeMs(Date.now()), 1000)
      return () => window.clearInterval(id)
    }

    if (anchor.state === 'COOLDOWN') {
      setCurrentTimeMs(Date.now())

      const safeDuration = Number.isFinite(cooldownDurationMs)
        ? cooldownDurationMs
        : DEFAULT_COOLDOWN_MS
      const cooldownEndsAtMs = toFiniteTimestamp(anchor.cooldownExpiresAt)
      const sessionEndedAtMs = toFiniteTimestamp(anchor.endedAt)
      const resolvedEndsAt =
        cooldownEndsAtMs ?? (sessionEndedAtMs ? sessionEndedAtMs + safeDuration : undefined)

      if (!resolvedEndsAt) return

      const remainingMs = resolvedEndsAt - Date.now()
      if (remainingMs <= 0) return

      const id = window.setTimeout(() => setCurrentTimeMs(Date.now()), remainingMs)
      return () => window.clearTimeout(id)
    }
  }, [anchor.state, anchor.cooldownExpiresAt, anchor.endedAt, cooldownDurationMs])

  // ── Derived display values ─────────────────────────────────────────────────

  const startedAtMs = toFiniteTimestamp(anchor.startedAt)
  const pausedAtMs = toFiniteTimestamp(anchor.pausedAt)
  const endedAtMs = toFiniteTimestamp(anchor.endedAt)
  const cooldownEndsAtMs = toFiniteTimestamp(anchor.cooldownExpiresAt)
  const safeDuration = Number.isFinite(cooldownDurationMs)
    ? cooldownDurationMs
    : DEFAULT_COOLDOWN_MS

  /** Active session time (pauses excluded). Backend-synced via cumulativePauseMs. */
  const activeElapsedSeconds = (() => {
    if (!startedAtMs) return 0
    if (anchor.state === 'ACTIVE') {
      return Math.max(
        0,
        Math.floor((currentTimeMs - startedAtMs - anchor.cumulativePauseMs) / 1000)
      )
    }
    if (anchor.state === 'PAUSED' && pausedAtMs) {
      return Math.max(0, Math.floor((pausedAtMs - startedAtMs - anchor.cumulativePauseMs) / 1000))
    }
    if (endedAtMs) {
      return Math.max(0, Math.floor((endedAtMs - startedAtMs - anchor.cumulativePauseMs) / 1000))
    }
    return 0
  })()

  /** Duration of the current pause segment. */
  const pausedElapsedSeconds =
    anchor.state === 'PAUSED' && pausedAtMs
      ? Math.max(0, Math.floor((currentTimeMs - pausedAtMs) / 1000))
      : 0

  /** Total pause time including any active pause segment. */
  const totalPauseSeconds = Math.floor(
    (anchor.cumulativePauseMs +
      (anchor.state === 'PAUSED' && pausedAtMs ? currentTimeMs - pausedAtMs : 0)) /
      1000
  )

  /** Cooldown seconds remaining. */
  const cooldownRemainingSeconds = (() => {
    if (anchor.state !== 'COOLDOWN') return 0
    const endsAt = cooldownEndsAtMs ?? (endedAtMs ? endedAtMs + safeDuration : undefined)
    if (!endsAt) return 0
    return Math.max(0, Math.floor((endsAt - currentTimeMs) / 1000))
  })()

  /** Seconds since session ended (ENDED / CLEANUP states). */
  const endedElapsedSeconds =
    (anchor.state === 'ENDED' || anchor.state === 'CLEANUP') && endedAtMs
      ? Math.max(0, Math.floor((currentTimeMs - endedAtMs) / 1000))
      : 0

  /** Seconds since the session was created — backend-authoritative, same for all users. */
  const greenroomElapsedSeconds =
    anchor.state === 'IDLE' && anchor.createdAt
      ? Math.max(0, Math.floor((currentTimeMs - anchor.createdAt) / 1000))
      : 0

  // ── Primary display ────────────────────────────────────────────────────────

  let primaryLabel: string
  let primaryStateClass: string

  switch (anchor.state) {
    case 'ACTIVE':
      primaryLabel = formatDuration(activeElapsedSeconds)
      primaryStateClass = 'is-active'
      break
    case 'PAUSED':
      primaryLabel = formatDuration(pausedElapsedSeconds)
      primaryStateClass = 'is-paused'
      break
    case 'COOLDOWN':
      primaryLabel = formatDuration(cooldownRemainingSeconds)
      primaryStateClass = 'is-ended'
      break
    case 'ENDED':
    case 'CLEANUP':
      primaryLabel = formatDuration(endedElapsedSeconds)
      primaryStateClass = ''
      break
    case 'IDLE':
    default:
      primaryLabel = formatDuration(greenroomElapsedSeconds)
      primaryStateClass = ''
  }

  // Popper is available for all non-greenroom states
  const canShowPopper =
    anchor.state === 'ACTIVE' ||
    anchor.state === 'PAUSED' ||
    anchor.state === 'COOLDOWN' ||
    anchor.state === 'ENDED' ||
    anchor.state === 'CLEANUP'

  return (
    <div className="session-toolbar__timer-group">
      <div
        className="session-toolbar__timer-wrap"
        onMouseEnter={canShowPopper ? () => setShowPopper(true) : undefined}
        onMouseLeave={canShowPopper ? () => setShowPopper(false) : undefined}
        onFocus={canShowPopper ? () => setShowPopper(true) : undefined}
        onBlur={
          canShowPopper
            ? (event) => {
                const nextTarget = event.relatedTarget as Node | null
                if (!event.currentTarget.contains(nextTarget)) {
                  setShowPopper(false)
                }
              }
            : undefined
        }
      >
        <button
          type="button"
          className={`session-toolbar__timer-pill${canShowPopper ? ' session-toolbar__timer-pill--interactive' : ''}`}
          aria-label={`Session timer: ${primaryLabel}.${canShowPopper ? ' Hover for details.' : ''}`}
          aria-expanded={canShowPopper ? showPopper : undefined}
        >
          <span className="session-toolbar__timer-main">
            <Icon name={anchor.state === 'COOLDOWN' ? 'hourglass' : 'timer'} />
            <strong>{primaryLabel}</strong>
          </span>
          <span className="session-toolbar__timer-state-wrap">
            <span className={`session-toolbar__timer-state ${primaryStateClass}`}>
              {anchor.state}
            </span>
          </span>
        </button>

        {canShowPopper && showPopper ? (
          <div
            className="session-toolbar__timer-popper"
            role="region"
            aria-label="Session timer details"
          >
            <div className="session-toolbar__timer-popper-row">
              <span>Started</span>
              <strong>{formatTimestamp(startedAtMs)}</strong>
            </div>
            <div className="session-toolbar__timer-popper-row">
              <span>Active time</span>
              <strong>{formatDuration(activeElapsedSeconds)}</strong>
            </div>
            {anchor.state === 'PAUSED' ? (
              <div className="session-toolbar__timer-popper-row session-toolbar__timer-popper-row--highlight">
                <span>Paused for</span>
                <strong>{formatDuration(pausedElapsedSeconds)}</strong>
              </div>
            ) : null}
            <div className="session-toolbar__timer-popper-row">
              <span>Total pause time</span>
              <strong>{formatDuration(totalPauseSeconds)}</strong>
            </div>
            <div className="session-toolbar__timer-popper-row">
              <span>Times paused</span>
              <strong>{anchor.pauseCount}</strong>
            </div>
            {anchor.state === 'COOLDOWN' ? (
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
}

export const SessionTimerLeaf = memo(SessionTimerLeafInner)
