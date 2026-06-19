import { memo, useState, useEffect } from 'react'
import { SessionState } from '@shared'

const TIMER_VISIBLE_STATES = new Set<SessionState>([
  SessionState.ACTIVE,
  SessionState.PAUSED,
  SessionState.COOLDOWN,
])

function formatElapsedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return m === 0 ? `${h}h` : `${h}h ${m}m`
  return m === 0 ? `${s}s` : `${m}m ${s}s`
}

interface SessionTimerCardProps {
  sessionStartedAt: number | undefined
  sessionStateLabel: string
  plannedDurationMinutes: number
}

/**
 * Isolated leaf component that owns the 1-second tick for the session timer
 * display. Kept separate from CampaignSessionSettingsPanel so the Radix Slider
 * children in that panel are not re-rendered on every clock tick.
 */
export const SessionTimerCard = memo(function SessionTimerCard({
  sessionStartedAt,
  sessionStateLabel,
  plannedDurationMinutes,
}: SessionTimerCardProps) {
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now())

  const isVisible =
    Boolean(sessionStartedAt) &&
    TIMER_VISIBLE_STATES.has(sessionStateLabel as SessionState)

  useEffect(() => {
    if (!isVisible) return
    setCurrentTimeMs(Date.now())
    const interval = setInterval(() => setCurrentTimeMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible || !sessionStartedAt) return null

  const durationSecs = plannedDurationMinutes * 60
  const elapsed = Math.floor((currentTimeMs - sessionStartedAt) / 1000)
  const remainingSecs = Math.max(0, durationSecs - elapsed)
  const remainingMins = Math.ceil(remainingSecs / 60)

  const timerColor: 'default' | 'warning' | 'critical' =
    elapsed >= durationSecs ? 'critical' : remainingMins <= 15 ? 'warning' : 'default'

  return (
    <div className={`csp-card csp-card--timer csp-card--timer-${timerColor}`}>
      <h5 className="crbs-heading csp-card-heading">Session Timer</h5>
      <div className="csp-timer-display">
        <div className="csp-timer-value">{formatElapsedTime(elapsed)}</div>
        <div className="csp-timer-label">elapsed</div>
      </div>
      <div className="csp-timer-remaining">
        <span className="csp-timer-remaining-label">
          {elapsed >= durationSecs ? 'Over by' : 'Remaining'}
        </span>
        <span className={`csp-timer-remaining-value csp-timer-remaining-${timerColor}`}>
          {elapsed >= durationSecs
            ? formatElapsedTime(elapsed - durationSecs)
            : formatElapsedTime(remainingSecs)}
        </span>
      </div>
      {timerColor === 'warning' && <p className="csp-timer-warning">15 minutes remaining</p>}
      {timerColor === 'critical' && (
        <p className="csp-timer-critical">Session duration exceeded</p>
      )}
    </div>
  )
})
