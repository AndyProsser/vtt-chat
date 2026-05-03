import type { Role } from '@shared'
import { SessionState } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
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
    <TooltipProvider delayDuration={140}>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <article className="voice-rail-summary__stat" aria-label={`Rooms ${roomCount}`}>
                <Icon name="rooms" />
                <strong>{roomCount}</strong>
              </article>
            </TooltipTrigger>
            <TooltipContent>Rooms</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <article
                className="voice-rail-summary__stat"
                aria-label={`Connected presence ${presenceCount}`}
              >
                <Icon name="users" />
                <strong>{presenceCount}</strong>
              </article>
            </TooltipTrigger>
            <TooltipContent>Presence</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <article className="voice-rail-summary__stat" aria-label={`Sessions ${sessionCount}`}>
                <Icon name="panel" />
                <strong>{sessionCount}</strong>
              </article>
            </TooltipTrigger>
            <TooltipContent>Sessions</TooltipContent>
          </Tooltip>
        </div>
      </section>
    </TooltipProvider>
  )
}
