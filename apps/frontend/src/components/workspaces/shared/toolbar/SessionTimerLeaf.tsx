/**
 * SessionTimerLeaf
 *
 * Leaf-isolated, self-ticking session timer pill + popper.
 *
 * Why a leaf?  The timer ticks every second when ACTIVE / PAUSED / IDLE / etc.
 * Embedding that clock inside SessionToolbar caused the entire toolbar tree —
 * including the Radix TooltipProvider, every action button, and their Popper
 * subtrees — to re-render on each tick.  Isolating the clock here confines that.
 *
 * Why imperative (ref-based) ticking?  Even isolated in this leaf, driving the
 * 1-second update through React state (`setState` → commit) still forces a React
 * commit every second.  A profiler trace showed that single tick dragging the
 * sibling toolbar icons, the (memoized) ConnectionStatusLeaf, and the open
 * right-rail Radix Tabs through reconciliation once per second — pure wasted
 * work that compounds over a months-long session.  To eliminate the commit
 * entirely, the per-second value is computed in the interval callback and
 * written straight to the DOM via refs.  No `setState` per tick → no commit →
 * nothing outside this leaf can re-render on the clock.
 *
 * React state is retained ONLY for inputs that genuinely change what renders:
 * - `anchor`    server-driven timing anchors (change only on WS state events)
 * - `showPopper` hover/focus popper visibility
 *
 * Design contract:
 * - Accepts only `{ sessionId, cooldownDurationMs? }` — both stable across
 *   session lifetime (no transient values as props).
 * - Reads all timing-anchor data from Zustand via a custom-equality selector.
 *   The anchor only changes on server-driven state events; never on clock ticks.
 * - ACTIVE / PAUSED / IDLE / ENDED / CLEANUP → 1-second setInterval (ref writes)
 * - COOLDOWN                                  → single setTimeout to the expiry
 * - All other states                          → no timer (static display)
 */

import { memo, useState, useEffect, useRef } from 'react'
import { SessionState, type UUID } from '@shared'
import { useStore } from '@/state/store'
import {
  DEFAULT_COOLDOWN_MS,
  formatDuration,
  formatTimestamp,
  toFiniteTimestamp,
} from '@/constants/sessionToolbar.constants'
import { getSessionStateLabel, SESSION_TIMER_COPY } from '@/constants/sessionUi.constants'
import { Icon } from '@/components/ui/Icon'

// ── Zustand anchor ────────────────────────────────────────────────────────────
// All fields are backend-authoritative timestamps / counters.  They change only
// when a server WS event arrives — never on clock ticks.

interface SessionTimerAnchor {
  state: SessionState | string
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
  state: SessionState.IDLE,
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

// ── Pure duration math ─────────────────────────────────────────────────────────
// Shared by the initial render (fresh `Date.now()`) and the per-second imperative
// writer.  Keeping it pure guarantees the displayed value is identical whether it
// came from a React render or a direct DOM write.

interface TimerDurations {
  primaryLabel: string
  activeElapsedSeconds: number
  pausedElapsedSeconds: number
  totalPauseSeconds: number
  cooldownRemainingSeconds: number
}

/** Compute every clock-dependent display value for a given moment. */
function computeTimerDurations(
  anchor: SessionTimerAnchor,
  nowMs: number,
  cooldownDurationMs: number
): TimerDurations {
  const startedAtMs = toFiniteTimestamp(anchor.startedAt)
  const pausedAtMs = toFiniteTimestamp(anchor.pausedAt)
  const endedAtMs = toFiniteTimestamp(anchor.endedAt)
  const cooldownEndsAtMs = toFiniteTimestamp(anchor.cooldownExpiresAt)
  const safeDuration = Number.isFinite(cooldownDurationMs) ? cooldownDurationMs : DEFAULT_COOLDOWN_MS

  /** Active session time (pauses excluded). Backend-synced via cumulativePauseMs. */
  const activeElapsedSeconds = (() => {
    if (!startedAtMs) return 0
    if (anchor.state === SessionState.ACTIVE) {
      return Math.max(0, Math.floor((nowMs - startedAtMs - anchor.cumulativePauseMs) / 1000))
    }
    if (anchor.state === SessionState.PAUSED && pausedAtMs) {
      return Math.max(0, Math.floor((pausedAtMs - startedAtMs - anchor.cumulativePauseMs) / 1000))
    }
    if (endedAtMs) {
      return Math.max(0, Math.floor((endedAtMs - startedAtMs - anchor.cumulativePauseMs) / 1000))
    }
    return 0
  })()

  /** Duration of the current pause segment. */
  const pausedElapsedSeconds =
    anchor.state === SessionState.PAUSED && pausedAtMs
      ? Math.max(0, Math.floor((nowMs - pausedAtMs) / 1000))
      : 0

  /** Total pause time including any active pause segment. */
  const totalPauseSeconds = Math.floor(
    (anchor.cumulativePauseMs +
      (anchor.state === SessionState.PAUSED && pausedAtMs ? nowMs - pausedAtMs : 0)) /
      1000
  )

  /** Cooldown seconds remaining. */
  const cooldownRemainingSeconds = (() => {
    if (anchor.state !== SessionState.COOLDOWN) return 0
    const endsAt = cooldownEndsAtMs ?? (endedAtMs ? endedAtMs + safeDuration : undefined)
    if (!endsAt) return 0
    return Math.max(0, Math.floor((endsAt - nowMs) / 1000))
  })()

  /** Seconds since session ended (ENDED / CLEANUP states). */
  const endedElapsedSeconds =
    (anchor.state === SessionState.ENDED || anchor.state === SessionState.CLEANUP) && endedAtMs
      ? Math.max(0, Math.floor((nowMs - endedAtMs) / 1000))
      : 0

  /** Seconds since the session was created — backend-authoritative, same for all users. */
  const greenroomElapsedSeconds =
    anchor.state === SessionState.IDLE && anchor.createdAt
      ? Math.max(0, Math.floor((nowMs - anchor.createdAt) / 1000))
      : 0

  let primaryLabel: string
  switch (anchor.state) {
    case SessionState.ACTIVE:
      primaryLabel = formatDuration(activeElapsedSeconds)
      break
    case SessionState.PAUSED:
      primaryLabel = formatDuration(pausedElapsedSeconds)
      break
    case SessionState.COOLDOWN:
      primaryLabel = formatDuration(cooldownRemainingSeconds)
      break
    case SessionState.ENDED:
    case SessionState.CLEANUP:
      primaryLabel = formatDuration(endedElapsedSeconds)
      break
    case SessionState.IDLE:
    default:
      primaryLabel = formatDuration(greenroomElapsedSeconds)
  }

  return {
    primaryLabel,
    activeElapsedSeconds,
    pausedElapsedSeconds,
    totalPauseSeconds,
    cooldownRemainingSeconds,
  }
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
    const session = sessions[sessionId]

    if (!session) {
      // Return the same EMPTY_ANCHOR constant — always the same reference.
      if (anchorCacheRef.current === EMPTY_ANCHOR) return EMPTY_ANCHOR
      anchorCacheRef.current = EMPTY_ANCHOR
      return EMPTY_ANCHOR
    }

    // All fields read directly from the session record.  Every timestamp is
    // server-provided (set by the backend and mirrored into the record on each
    // WS state-change event), so all connected clients compute identical timers.
    const next: SessionTimerAnchor = {
      state: session.state as string,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      pausedAt: session.pausedAt,
      endedAt: session.endedAt,
      cooldownExpiresAt: session.cooldownExpiresAt,
      cumulativePauseMs: session.cumulativePauseMs ?? 0,
      pauseCount: session.pauseCount ?? 0,
      pauseStartedAt: session.pauseStartedAt,
    }

    // Return cached reference when fields haven't changed — this keeps
    // getSnapshot stable across repeated calls within the same render.
    if (anchorEqual(anchorCacheRef.current, next)) return anchorCacheRef.current

    anchorCacheRef.current = next
    return next
  })

  const [showPopper, setShowPopper] = useState(false)

  // ── Imperative tick targets ───────────────────────────────────────────────
  // The interval writes formatted text straight into these nodes.  Because no
  // React state changes on tick, no commit fires and nothing outside this leaf
  // re-renders.  Popper refs are only attached while the popper is mounted; the
  // writer null-checks each one.
  const primaryRef = useRef<HTMLElement>(null)
  const activeTimeRef = useRef<HTMLElement>(null)
  const pausedForRef = useRef<HTMLElement>(null)
  const totalPauseRef = useRef<HTMLElement>(null)
  const cooldownLeftRef = useRef<HTMLElement>(null)

  // Per-render closure capturing the freshest anchor.  Stored in a ref so the
  // interval/timeout always calls the latest version without re-subscribing
  // (and therefore without recreating the timer) on unrelated anchor changes.
  const writeDisplay = (nowMs: number) => {
    const d = computeTimerDurations(anchor, nowMs, cooldownDurationMs)
    if (primaryRef.current) primaryRef.current.textContent = d.primaryLabel
    if (activeTimeRef.current) activeTimeRef.current.textContent = formatDuration(d.activeElapsedSeconds)
    if (pausedForRef.current) pausedForRef.current.textContent = formatDuration(d.pausedElapsedSeconds)
    if (totalPauseRef.current) totalPauseRef.current.textContent = formatDuration(d.totalPauseSeconds)
    if (cooldownLeftRef.current)
      cooldownLeftRef.current.textContent = formatDuration(d.cooldownRemainingSeconds)
  }
  const writeDisplayRef = useRef(writeDisplay)
  writeDisplayRef.current = writeDisplay

  // Clock driver: interval for ticking states, one-shot for COOLDOWN, nothing
  // otherwise.  Each fire writes the DOM imperatively via the latest writer.
  useEffect(() => {
    const tick = () => writeDisplayRef.current(Date.now())

    if (
      anchor.state === SessionState.ACTIVE ||
      anchor.state === SessionState.PAUSED ||
      anchor.state === SessionState.IDLE ||
      anchor.state === SessionState.ENDED ||
      anchor.state === SessionState.CLEANUP
    ) {
      tick() // sync immediately so the value is fresh after a state transition
      const id = window.setInterval(tick, 1000)
      return () => window.clearInterval(id)
    }

    if (anchor.state === SessionState.COOLDOWN) {
      tick()

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

      const id = window.setTimeout(tick, remainingMs)
      return () => window.clearTimeout(id)
    }
  }, [anchor.state, anchor.cooldownExpiresAt, anchor.endedAt, cooldownDurationMs])

  // ── Initial / structural render values ─────────────────────────────────────
  // Computed once per render with a fresh `Date.now()` so the very first paint
  // (and any re-render from anchor / popper changes) shows the correct value
  // immediately; the interval keeps it ticking thereafter via refs.
  const nowMs = Date.now()
  const display = computeTimerDurations(anchor, nowMs, cooldownDurationMs)
  const startedAtMs = toFiniteTimestamp(anchor.startedAt)
  const stateLabel = getSessionStateLabel(anchor.state)

  let primaryStateClass: string
  switch (anchor.state) {
    case SessionState.ACTIVE:
      primaryStateClass = 'is-active'
      break
    case SessionState.PAUSED:
      primaryStateClass = 'is-paused'
      break
    case SessionState.COOLDOWN:
      primaryStateClass = 'is-ended'
      break
    default:
      primaryStateClass = ''
  }

  // Popper is available for all non-greenroom states
  const canShowPopper =
    anchor.state === SessionState.ACTIVE ||
    anchor.state === SessionState.PAUSED ||
    anchor.state === SessionState.COOLDOWN ||
    anchor.state === SessionState.ENDED ||
    anchor.state === SessionState.CLEANUP

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
          aria-label={`${SESSION_TIMER_COPY.ariaLabelPrefix}: ${display.primaryLabel}.${canShowPopper ? ` ${SESSION_TIMER_COPY.hoverForDetails}` : ''}`}
          aria-expanded={canShowPopper ? showPopper : undefined}
        >
          <span className="session-toolbar__timer-main">
            <Icon name={anchor.state === SessionState.COOLDOWN ? 'hourglass' : 'timer'} />
            <strong ref={primaryRef}>{display.primaryLabel}</strong>
          </span>
          <span className="session-toolbar__timer-state-wrap">
            <span className={`session-toolbar__timer-state ${primaryStateClass}`}>
              {stateLabel}
            </span>
          </span>
        </button>

        {canShowPopper && showPopper ? (
          <div
            className="session-toolbar__timer-popper"
            role="region"
            aria-label={SESSION_TIMER_COPY.detailsAriaLabel}
          >
            <div className="session-toolbar__timer-popper-row">
              <span>{SESSION_TIMER_COPY.startedLabel}</span>
              <strong>{formatTimestamp(startedAtMs)}</strong>
            </div>
            <div className="session-toolbar__timer-popper-row">
              <span>{SESSION_TIMER_COPY.activeTimeLabel}</span>
              <strong ref={activeTimeRef}>{formatDuration(display.activeElapsedSeconds)}</strong>
            </div>
            {anchor.state === SessionState.PAUSED ? (
              <div className="session-toolbar__timer-popper-row session-toolbar__timer-popper-row--highlight">
                <span>{SESSION_TIMER_COPY.pausedForLabel}</span>
                <strong ref={pausedForRef}>{formatDuration(display.pausedElapsedSeconds)}</strong>
              </div>
            ) : null}
            <div className="session-toolbar__timer-popper-row">
              <span>{SESSION_TIMER_COPY.totalPauseTimeLabel}</span>
              <strong ref={totalPauseRef}>{formatDuration(display.totalPauseSeconds)}</strong>
            </div>
            <div className="session-toolbar__timer-popper-row">
              <span>{SESSION_TIMER_COPY.timesPausedLabel}</span>
              <strong>{anchor.pauseCount}</strong>
            </div>
            {anchor.state === SessionState.COOLDOWN ? (
              <div className="session-toolbar__timer-popper-row session-toolbar__timer-popper-row--ended">
                <span>{SESSION_TIMER_COPY.cooldownLeftLabel}</span>
                <strong ref={cooldownLeftRef}>
                  {formatDuration(display.cooldownRemainingSeconds)}
                </strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const SessionTimerLeaf = memo(SessionTimerLeafInner)
