/**
 * CampaignCard sub-component for SessionLobbyView.
 *
 * Renders a single campaign card in the lobby list. Supports both member cards
 * and discoverable non-member cards (dimmed/lock/request-to-join/watch flows).
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '../../core-ui'
import {
  type CampaignSummary,
  getCampaignEntryAction,
  getPrivacyCounterLabel,
} from './sessionInit.shared'

type CampaignVisualState = 'ACTIVE' | 'PAUSED' | 'COOLDOWN' | 'IDLE' | 'ENDED' | 'INACTIVE'

function getCampaignVisualState(campaign: CampaignSummary): CampaignVisualState {
  const hasConnectedTable = Boolean(campaign.dmOnline) || (campaign.connectedPlayers ?? 0) > 0

  if (!hasConnectedTable || campaign.latestSessionState === 'CLEANUP') {
    return 'INACTIVE'
  }

  if (campaign.latestSessionState === 'ACTIVE' || campaign.latestSessionState === 'PAUSED') {
    return 'ACTIVE'
  }

  if (campaign.latestSessionState === 'COOLDOWN') {
    return 'COOLDOWN'
  }

  if (campaign.latestSessionState === 'ENDED') {
    return 'ENDED'
  }

  return 'IDLE'
}

function getCampaignVisualStateLabel(state: CampaignVisualState): string {
  if (state === 'IDLE') {
    return 'Ready'
  }

  if (state === 'INACTIVE') {
    return 'Offline'
  }

  if (state === 'COOLDOWN') {
    return 'Finishing'
  }

  return state.charAt(0) + state.slice(1).toLowerCase()
}

function formatLastActiveLabel(campaign: CampaignSummary): string {
  const rawTimestamp = campaign.updatedAt ?? campaign.createdAt
  if (rawTimestamp === undefined || rawTimestamp === null) return 'Unknown'
  const numeric =
    typeof rawTimestamp === 'number'
      ? rawTimestamp
      : Number.isFinite(Number(rawTimestamp))
        ? Number(rawTimestamp)
        : Date.parse(String(rawTimestamp))
  if (!Number.isFinite(numeric)) return 'Unknown'
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

export type CampaignCardProps = {
  campaign: CampaignSummary
  isSelected: boolean
  onSelectCampaign: (id: CampaignSummary['id']) => void
  onOpenCampaignSettings: (id: CampaignSummary['id']) => void
  onEnterCampaign: (id: CampaignSummary['id']) => void
  onJoinRequest: (id: CampaignSummary['id']) => void
  onWatchCampaign: (id: CampaignSummary['id']) => void
  onError: (message: string) => void
}

export function CampaignCard({
  campaign,
  isSelected,
  onSelectCampaign,
  onOpenCampaignSettings,
  onEnterCampaign,
  onJoinRequest,
  onWatchCampaign,
  onError,
}: CampaignCardProps) {
  const state = getCampaignVisualState(campaign)
  const entryAction = getCampaignEntryAction(campaign)
  const dmStatus = campaign.dmOnline ? 'Online' : 'Offline'
  const dmTooltipClassName = campaign.dmOnline
    ? 'session-campaign-card__tooltip-status-online'
    : 'session-campaign-card__tooltip-status-offline'
  const playersLabel = getPrivacyCounterLabel(
    campaign.connectedPlayersLabel,
    campaign.connectedPlayersRounded
  )
  const spectatorsLabel = getPrivacyCounterLabel(
    campaign.connectedSpectatorsLabel,
    campaign.connectedSpectatorsRounded
  )
  const dmDisplayName = campaign.dmDisplayName || campaign.dmUsername || 'DM'
  const dmInitial = dmDisplayName.charAt(0).toUpperCase()
  const cardPosterUrl = campaign.posterUrl || undefined
  const lastActiveLabel = formatLastActiveLabel(campaign)
  const isDimmed = 'dimmed' in entryAction && entryAction.dimmed === true
  const showLock = 'showLock' in entryAction && entryAction.showLock === true

  const reviewLabel =
    campaign.memberRole === 'DM' ? 'Edit' : campaign.memberRole === 'PLAYER' ? 'Review' : null

  function handleEntryClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (entryAction.disabled) {
      if (entryAction.reason) onError(entryAction.reason)
      return
    }
    if ('action' in entryAction) {
      if (entryAction.action === 'joinRequest') {
        onJoinRequest(campaign.id)
        return
      }
      if (entryAction.action === 'watch') {
        onWatchCampaign(campaign.id)
        return
      }
    }
    onEnterCampaign(campaign.id)
  }

  return (
    <div
      role="listitem"
      tabIndex={0}
      onClick={() => onSelectCampaign(campaign.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelectCampaign(campaign.id)
        }
      }}
      className={[
        'session-campaign-card',
        isSelected ? 'is-selected' : '',
        cardPosterUrl ? 'has-poster' : '',
        isDimmed ? 'is-dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        cardPosterUrl
          ? {
              backgroundImage: `linear-gradient(rgba(12, 17, 28, 0.62), rgba(12, 17, 28, 0.62)), url(${cardPosterUrl})`,
            }
          : undefined
      }
    >
      <span className="session-campaign-card__header">
        <span className="session-campaign-card__title">
          <span
            className={`session-campaign-card__state-dot state-${state.toLowerCase()}`}
            aria-label={`Campaign ${getCampaignVisualStateLabel(state).toLowerCase()}`}
            title={getCampaignVisualStateLabel(state)}
          />
          <span>{campaign.name}</span>
          {showLock && (
            <span
              className="material-symbols-outlined session-campaign-card__lock-icon"
              aria-label="Private campaign"
              title="Private campaign"
            >
              lock
            </span>
          )}
        </span>
        <span className="session-campaign-card__stats" aria-label="Campaign activity stats">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-campaign-card__stat">
                <span className="material-symbols-outlined" aria-hidden="true">
                  groups
                </span>
                <span>{playersLabel}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Connected players</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-campaign-card__stat">
                <span className="material-symbols-outlined" aria-hidden="true">
                  visibility
                </span>
                <span>{spectatorsLabel}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Connected spectators</TooltipContent>
          </Tooltip>
        </span>
      </span>

      <span
        className={`session-campaign-card__dm session-campaign-card__dm--${campaign.dmOnline ? 'online' : 'offline'}`}
      >
        {campaign.dmAvatarUrl ? (
          <img
            src={campaign.dmAvatarUrl}
            alt={`${dmDisplayName} avatar`}
            className="session-campaign-card__dm-avatar"
          />
        ) : (
          <span className="session-campaign-card__dm-avatar session-campaign-card__dm-avatar--fallback">
            {dmInitial}
          </span>
        )}
        <span className="session-campaign-card__dm-name">{dmDisplayName}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="session-campaign-card__dm-status-pill" aria-label={`DM ${dmStatus}`}>
              {dmStatus}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            DM Status: <span className={dmTooltipClassName}>{dmStatus.toUpperCase()}</span>
          </TooltipContent>
        </Tooltip>
      </span>

      <span className="session-campaign-card__description">
        {campaign.description || 'No description provided.'}
      </span>
      <span className="session-campaign-card__meta">Last active: {lastActiveLabel}</span>

      <span className="session-campaign-card__actions">
        {/* DM: Edit / Player: Review button */}
        {reviewLabel ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-card-action-button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onOpenCampaignSettings(campaign.id)
                }}
                aria-label="Campaign settings"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  tune
                </span>
                <span>{reviewLabel}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {campaign.memberRole === 'DM' ? 'Edit campaign' : 'Review campaign'}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {/* DM: pending join request badge */}
        {campaign.memberRole === 'DM' && (campaign.pendingJoinRequests ?? 0) > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="session-card-action-button session-card-action-button--badge"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onOpenCampaignSettings(campaign.id)
                }}
                aria-label={`${campaign.pendingJoinRequests} pending join requests`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  person_add
                </span>
                <span className="session-card-action-button__badge">
                  {campaign.pendingJoinRequests}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {campaign.pendingJoinRequests} pending join{' '}
              {campaign.pendingJoinRequests === 1 ? 'request' : 'requests'}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {/* Primary entry action: Launch / Request to Join / Watch / Invite Only */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <button
                type="button"
                className="session-card-action-button session-card-action-button-launch"
                onClick={handleEntryClick}
                aria-label={entryAction.reason || `${entryAction.label} campaign`}
                disabled={entryAction.disabled}
              >
                <span>{entryAction.label}</span>
                <span className="material-symbols-outlined" aria-hidden="true">
                  {entryAction.icon}
                </span>
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {entryAction.reason || `${entryAction.label} campaign`}
          </TooltipContent>
        </Tooltip>
      </span>
    </div>
  )
}
