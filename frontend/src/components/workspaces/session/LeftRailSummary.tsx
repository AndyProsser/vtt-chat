import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'

interface LeftRailSummaryProps {
  campaignName: string
  campaignDescription?: string | null
  sessionName: string
  sessionCount: number
  connectedPlayersCount: number
  connectedSpectatorsCount?: number
  onOpenInfoPanel?: () => void
}

export function LeftRailSummary({
  campaignName,
  campaignDescription,
  sessionName,
  sessionCount,
  connectedPlayersCount,
  connectedSpectatorsCount = 0,
  onOpenInfoPanel,
}: LeftRailSummaryProps) {
  const hasSpectators = connectedSpectatorsCount > 0

  return (
    <TooltipProvider delayDuration={120}>
      <section className="voice-rail-summary" aria-label="Campaign information panel">
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
              <TooltipContent>Sessions</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <article
                  className="voice-rail-summary__stat"
                  aria-label={`Connected players ${connectedPlayersCount}`}
                >
                  <Icon name="users" />
                  <strong>{connectedPlayersCount}</strong>
                </article>
              </TooltipTrigger>
              <TooltipContent>Connected Players</TooltipContent>
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
                <TooltipContent>Spectators</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </header>

        <button
          type="button"
          className="voice-rail-summary__campaign-name"
          onClick={onOpenInfoPanel}
          disabled={!onOpenInfoPanel}
        >
          {campaignName}
        </button>
        <button
          type="button"
          className="voice-rail-summary__campaign-description"
          onClick={onOpenInfoPanel}
          disabled={!onOpenInfoPanel}
        >
          {campaignDescription?.trim() || 'No description provided.'}
        </button>

        <hr className="voice-rail-summary__divider" aria-hidden="true" />

        <p className="voice-rail-summary__session">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="voice-rail-summary__session-value">{sessionName}</span>
            </TooltipTrigger>
            <TooltipContent side="top">{sessionName}</TooltipContent>
          </Tooltip>
        </p>
      </section>
    </TooltipProvider>
  )
}
