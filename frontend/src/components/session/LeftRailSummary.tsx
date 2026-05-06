import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../core-ui'
import { Icon } from '../ui/Icon'

interface LeftRailSummaryProps {
  campaignName: string
  campaignDescription?: string | null
  sessionName: string
  sessionCount: number
  connectedPlayersCount: number
  connectedSpectatorsCount?: number
}

export function LeftRailSummary({
  campaignName,
  campaignDescription,
  sessionName,
  sessionCount,
  connectedPlayersCount,
  connectedSpectatorsCount = 0,
}: LeftRailSummaryProps) {
  const hasSpectators = connectedSpectatorsCount > 0

  return (
    <TooltipProvider delayDuration={120}>
      <section className="voice-rail-summary" aria-label="Campaign info panel">
        <header className="voice-rail-summary__header">
          <div className="voice-rail-summary__title-row">
            <Icon name="notes" className="voice-rail-summary__icon" />
            <h4 className="voice-rail-summary__title">Info Panel</h4>
          </div>

          <div className="voice-rail-summary__stats" aria-label="Campaign activity">
            <Tooltip>
              <TooltipTrigger asChild>
                <article
                  className="voice-rail-summary__stat"
                  aria-label={`Sessions ${sessionCount}`}
                >
                  <Icon name="panel" />
                  <strong>{sessionCount}</strong>
                </article>
              </TooltipTrigger>
              <TooltipContent className="session-toolbar__tooltip-content">Sessions</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <article
                  className="voice-rail-summary__stat"
                  aria-label={`Connected players including DM ${connectedPlayersCount}`}
                >
                  <Icon name="users" />
                  <strong>{connectedPlayersCount}</strong>
                </article>
              </TooltipTrigger>
              <TooltipContent className="session-toolbar__tooltip-content">
                Connected Players + DM
              </TooltipContent>
            </Tooltip>

            {hasSpectators ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <article
                    className="voice-rail-summary__stat"
                    aria-label={`Connected spectators ${connectedSpectatorsCount}`}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      visibility
                    </span>
                    <strong>{connectedSpectatorsCount}</strong>
                  </article>
                </TooltipTrigger>
                <TooltipContent className="session-toolbar__tooltip-content">
                  Spectators
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </header>

        <p className="voice-rail-summary__campaign-name">{campaignName}</p>
        <p className="voice-rail-summary__campaign-description">
          {campaignDescription?.trim() || 'No description provided.'}
        </p>

        <hr className="voice-rail-summary__divider" aria-hidden="true" />

        <p className="voice-rail-summary__session">
          <span className="voice-rail-summary__session-value">{sessionName}</span>
        </p>
      </section>
    </TooltipProvider>
  )
}
