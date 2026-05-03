import type { Role } from '@shared'
import { SessionState } from '@shared'
import { Icon } from '../ui/Icon'

interface LeftRailSummaryProps {
  role: Role
  username: string
  sessionName: string
  sessionState: SessionState
  sessionCount: number
  roomCount: number
  presenceCount: number
}

export function LeftRailSummary({
  role,
  username,
  sessionName,
  sessionState,
  sessionCount,
  roomCount,
  presenceCount,
}: LeftRailSummaryProps) {
  return (
    <section className="voice-rail-summary" aria-label="Voice rail summary">
      <header className="voice-rail-summary__header">
        <div className="voice-rail-summary__title-row">
          <Icon name="voice" className="voice-rail-summary__icon" />
          <h4 className="voice-rail-summary__title">Voice Panel</h4>
        </div>
        <span
          className={`voice-rail-summary__state ${
            sessionState === SessionState.ACTIVE
              ? 'active'
              : sessionState === SessionState.PAUSED
                ? 'paused'
                : ''
          }`}
        >
          {sessionState}
        </span>
      </header>

      <p className="voice-rail-summary__identity">
        Connected as <strong>{username}</strong> ({role})
      </p>

      <p className="voice-rail-summary__session">{sessionName}</p>

      <div className="voice-rail-summary__stats">
        <article className="voice-rail-summary__stat">
          <Icon name="rooms" />
          <div>
            <p>Rooms</p>
            <strong>{roomCount}</strong>
          </div>
        </article>
        <article className="voice-rail-summary__stat">
          <Icon name="users" />
          <div>
            <p>Presence</p>
            <strong>{presenceCount}</strong>
          </div>
        </article>
        <article className="voice-rail-summary__stat">
          <Icon name="panel" />
          <div>
            <p>Sessions</p>
            <strong>{sessionCount}</strong>
          </div>
        </article>
      </div>
    </section>
  )
}
