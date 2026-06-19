import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import type { CampaignInformationStatusLineProps } from '@/types/campaignInformationPanel'
import { DmPresenceStatusLeaf } from './DmPresenceStatusLeaf'
import { Icon } from '@/components/ui/Icon'

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

function formatDmLastSeen(rawTimestamp?: number | string): string {
  if (rawTimestamp === undefined || rawTimestamp === null) {
    return 'Unknown'
  }

  const numeric =
    typeof rawTimestamp === 'number'
      ? rawTimestamp
      : Number.isFinite(Number(rawTimestamp))
        ? Number(rawTimestamp)
        : Date.parse(String(rawTimestamp))

  if (!Number.isFinite(numeric)) {
    return 'Unknown'
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(numeric))
  } catch {
    return 'Unknown'
  }
}

/**
 * Compact campaign activity summary used in both view and edit modes.
 * Renders a full-width DM identity row (avatar | name | live status | last seen)
 * above a 4-column grid of campaign stat chips.
 */
export function CampaignInformationStatusLine({
  campaign,
  sessionCount,
  totalSessionDurationMs,
  sessionId,
}: CampaignInformationStatusLineProps) {
  const displayName = campaign.dmDisplayName || campaign.dmUsername || 'DM'
  const dmInitial = displayName.charAt(0).toUpperCase()
  const dmLastSeenLabel = formatDmLastSeen(campaign.updatedAt ?? campaign.createdAt)
  const onlinePlayers = campaign.connectedPlayers ?? campaign.connectedPlayersRounded ?? 0
  const registeredPlayers =
    campaign.registeredPlayersCount ?? campaign.connectedPlayersRounded ?? onlinePlayers
  const onlineSpectators = campaign.connectedSpectators ?? campaign.connectedSpectatorsRounded ?? 0
  const averageSessionDurationMs = sessionCount > 0 ? totalSessionDurationMs / sessionCount : 0
  const totalTimeLabel = formatDuration(totalSessionDurationMs)
  const averageSessionLabel = formatDuration(averageSessionDurationMs)

  return (
    <div className="cip-status-line" role="list" aria-label="Campaign status summary">
      {/* Full-width DM row: Avatar | Name | Status (live leaf) | Last Seen */}
      <div className="cip-dm-row" role="listitem" aria-label="DM details">
        <span className="cip-dm-row__label" aria-hidden="true">
          DM:
        </span>
        {campaign.dmAvatarUrl ? (
          <img className="cip-dm-avatar" src={campaign.dmAvatarUrl} alt={`${displayName} avatar`} />
        ) : (
          <span className="cip-dm-avatar cip-dm-avatar--fallback" aria-hidden="true">
            {dmInitial}
          </span>
        )}

        <span className="cip-dm-row__name">{displayName}</span>

        <span className="cip-dm-row__meta">
          <DmPresenceStatusLeaf
            sessionId={sessionId}
            userId={campaign.currentDmId}
            fallbackOnline={campaign.dmOnline}
          />
          <span className="cip-dm-row__last-seen">{dmLastSeenLabel}</span>
        </span>
      </div>

      {/* 4-column stat chips */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Sessions stat">
            <Icon name="history" className="cip-status-chip__icon" />
            <span className="cip-status-chip__text">{sessionCount} Sessions</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Total sessions recorded for this campaign.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Total time stat">
            <Icon name="schedule" className="cip-status-chip__icon" />
            <span className="cip-status-chip__text">{totalTimeLabel} Total played</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Average session: {averageSessionLabel}.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Players stat">
            <Icon name="groups" className="cip-status-chip__icon" />
            <span className="cip-status-chip__text">
              {onlinePlayers}/{registeredPlayers} Players
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Online players / registered campaign players.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Spectators stat">
            <Icon name="visibility" className="cip-status-chip__icon" />
            <span className="cip-status-chip__text">{onlineSpectators} Spectators</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Spectators online right now.</TooltipContent>
      </Tooltip>
    </div>
  )
}
