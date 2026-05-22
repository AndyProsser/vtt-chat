import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'

type CampaignInformationStatusLineProps = {
  campaign: {
    name: string
    dmDisplayName?: string
    dmUsername?: string
    dmAvatarUrl?: string | null
    dmOnline?: boolean
    connectedPlayers?: number
    connectedSpectators?: number
    registeredPlayersCount?: number
    connectedPlayersRounded?: number
    connectedSpectatorsRounded?: number
    updatedAt?: number | string
    createdAt?: number | string
  }
  sessionCount: number
  totalSessionDurationMs: number
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
 */
export function CampaignInformationStatusLine({
  campaign,
  sessionCount,
  totalSessionDurationMs,
}: CampaignInformationStatusLineProps) {
  const displayName = campaign.dmDisplayName || campaign.dmUsername || 'DM'
  const dmInitial = displayName.charAt(0).toUpperCase()
  const dmStatusLabel = campaign.dmOnline ? 'Online' : 'Offline'
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
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="DM details">
            {campaign.dmAvatarUrl ? (
              <img
                className="cip-dm-avatar"
                src={campaign.dmAvatarUrl}
                alt={`${displayName} avatar`}
              />
            ) : (
              <span className="cip-dm-avatar cip-dm-avatar--fallback">{dmInitial}</span>
            )}
            <span className="cip-status-chip__text">DM: {displayName}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <div className="cip-dm-popper">
            <p className="cip-dm-popper__line">
              <span className="cip-dm-popper__label">Status</span>
              <span
                className={`cip-dm-popper__value ${campaign.dmOnline ? 'cip-dm-popper__value--online' : ''}`}
              >
                {dmStatusLabel}
              </span>
            </p>
            <p className="cip-dm-popper__line">
              <span className="cip-dm-popper__label">Last seen</span>
              <span className="cip-dm-popper__value">{dmLastSeenLabel}</span>
            </p>
          </div>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Sessions stat">
            <span className="material-symbols-outlined cip-status-chip__icon" aria-hidden="true">
              history
            </span>
            <span className="cip-status-chip__text">{sessionCount} Sessions</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Total sessions recorded for this campaign.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Total time stat">
            <span className="material-symbols-outlined cip-status-chip__icon" aria-hidden="true">
              schedule
            </span>
            <span className="cip-status-chip__text">{totalTimeLabel} Total played</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Average session: {averageSessionLabel}.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Players stat">
            <span className="material-symbols-outlined cip-status-chip__icon" aria-hidden="true">
              groups
            </span>
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
            <span className="material-symbols-outlined cip-status-chip__icon" aria-hidden="true">
              visibility
            </span>
            <span className="cip-status-chip__text">{onlineSpectators} Spectators</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Spectators online right now.</TooltipContent>
      </Tooltip>
    </div>
  )
}
