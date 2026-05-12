import type { UUID, SessionLifecycleState } from '@shared'
import '../../styles/components/session/CampaignInformationPanel.css'

interface CampaignInformationPanelProps {
  campaign: {
    id: UUID
    name: string
    description?: string | null
    posterUrl?: string | null
    dmDisplayName?: string
    dmUsername?: string
    dmAvatarUrl?: string | null
    connectedPlayersRounded?: number
    connectedSpectatorsRounded?: number
    latestSessionState?: SessionLifecycleState | 'INACTIVE' | null
  } | null
  sessionCount: number
  totalSessionDurationMs: number
  canEdit: boolean
  onEditCampaign: (campaignId: UUID) => void
}

function formatDuration(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return '0m'
  }

  const totalMinutes = Math.round(totalMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) {
    return `${minutes}m`
  }

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function formatSessionState(state?: SessionLifecycleState | 'INACTIVE' | null): string {
  if (!state) {
    return 'Unknown'
  }

  return state === 'INACTIVE' ? 'Idle' : state
}

export function CampaignInformationPanel({
  campaign,
  sessionCount,
  totalSessionDurationMs,
  canEdit,
  onEditCampaign,
}: CampaignInformationPanelProps) {
  if (!campaign) {
    return (
      <section className="cip-panel" aria-label="Campaign information">
        <h3 className="cip-heading">Campaign Information</h3>
        <p className="cip-muted">Select a campaign to view its metadata and activity summary.</p>
      </section>
    )
  }

  const displayName = campaign.dmDisplayName || campaign.dmUsername || 'DM'
  const dmInitial = displayName.charAt(0).toUpperCase()

  return (
    <section className="cip-panel" aria-label="Campaign information">
      <div className="cip-hero">
        <div className="cip-copy">
          <p className="cip-kicker">Campaign</p>
          <h3 className="cip-heading">{campaign.name}</h3>
          <p className="cip-description">{campaign.description || 'No description provided.'}</p>
        </div>

        <div className="cip-poster" aria-hidden="true">
          {campaign.posterUrl ? (
            <img className="cip-poster__image" src={campaign.posterUrl} alt="" />
          ) : (
            <div className="cip-poster__placeholder">{campaign.name.charAt(0).toUpperCase()}</div>
          )}
        </div>
      </div>

      <div className="cip-stats" role="list" aria-label="Campaign stats">
        <div className="cip-stat" role="listitem">
          <span className="cip-stat__value">{sessionCount}</span>
          <span className="cip-stat__label">Sessions</span>
        </div>
        <div className="cip-stat" role="listitem">
          <span className="cip-stat__value">{formatDuration(totalSessionDurationMs)}</span>
          <span className="cip-stat__label">Total duration</span>
        </div>
        <div className="cip-stat" role="listitem">
          <span className="cip-stat__value">{campaign.connectedPlayersRounded ?? 0}</span>
          <span className="cip-stat__label">Players</span>
        </div>
        <div className="cip-stat" role="listitem">
          <span className="cip-stat__value">{campaign.connectedSpectatorsRounded ?? 0}</span>
          <span className="cip-stat__label">Spectators</span>
        </div>
      </div>

      <div className="cip-meta">
        <div className="cip-meta__row">
          <span className="cip-meta__label">DM</span>
          <span className="cip-meta__value">
            {campaign.dmAvatarUrl ? (
              <img
                className="cip-dm-avatar"
                src={campaign.dmAvatarUrl}
                alt={`${displayName} avatar`}
              />
            ) : (
              <span className="cip-dm-avatar cip-dm-avatar--fallback">{dmInitial}</span>
            )}
            <span>{displayName}</span>
          </span>
        </div>
        <div className="cip-meta__row">
          <span className="cip-meta__label">Last session</span>
          <span className="cip-meta__value">{formatSessionState(campaign.latestSessionState)}</span>
        </div>
      </div>

      <div className="cip-actions">
        {canEdit ? (
          <button
            type="button"
            className="session-button session-button-brand"
            onClick={() => onEditCampaign(campaign.id)}
          >
            Edit campaign
          </button>
        ) : (
          <p className="cip-muted">Campaign metadata is read-only for your role.</p>
        )}
      </div>
    </section>
  )
}
