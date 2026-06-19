/**
 * CampaignCard sub-component for LobbyView.
 *
 * Renders a single campaign card in the lobby list. Supports both member cards
 * and discoverable non-member cards (dimmed/lock/request-to-join/watch flows).
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type CampaignJoinRequestSummary,
  type CampaignSummary,
  getCampaignEntryAction,
  getPrivacyCounterLabel,
} from '@/types/session/campaign'
import { LobbyJoinRequestsPanel } from './LobbyJoinRequestsPanel'
import { Icon } from '@/components/ui/Icon'
import {
  buildCampaignDescriptionPreviewText,
  formatLastActiveLabel,
  getCampaignVisualState,
  getCampaignVisualStateLabel,
  renderCampaignDescription,
} from './LobbyView.CampaignCard.helpers'

export type CampaignCardProps = {
  campaign: CampaignSummary
  isSelected: boolean
  onSelectCampaign: (id: CampaignSummary['id']) => void
  onOpenCampaignSettings: (id: CampaignSummary['id']) => void
  onEnterCampaign: (id: CampaignSummary['id']) => void
  onJoinRequest: (campaign: CampaignSummary) => void
  onWatchCampaign: (campaign: CampaignSummary) => void
  onLoadPendingJoinRequests: (
    campaignId: CampaignSummary['id']
  ) => Promise<CampaignJoinRequestSummary[]>
  onResolveJoinRequest: (
    campaignId: CampaignSummary['id'],
    requestId: CampaignJoinRequestSummary['id'],
    resolution: 'APPROVED' | 'REJECTED'
  ) => Promise<void>
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
  onLoadPendingJoinRequests,
  onResolveJoinRequest,
  onError,
}: CampaignCardProps) {
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [isDescriptionTruncated, setIsDescriptionTruncated] = useState(false)
  const previewTextRef = useRef<HTMLParagraphElement | null>(null)
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
  const descriptionPreviewText = useMemo(
    () => buildCampaignDescriptionPreviewText(campaign.description),
    [campaign.description]
  )

  const reviewLabel =
    campaign.memberRole === 'DM' ? 'Edit' : campaign.memberRole === 'PLAYER' ? 'Review' : null

  useEffect(() => {
    const previewElement = previewTextRef.current
    if (!previewElement) {
      setIsDescriptionTruncated(false)
      return
    }

    const measureTruncation = () => {
      const nextIsTruncated = previewElement.scrollHeight - previewElement.clientHeight > 1
      setIsDescriptionTruncated((prev) => (prev === nextIsTruncated ? prev : nextIsTruncated))
    }

    measureTruncation()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureTruncation)
      return () => {
        window.removeEventListener('resize', measureTruncation)
      }
    }

    const observer = new ResizeObserver(() => {
      measureTruncation()
    })
    observer.observe(previewElement)

    return () => {
      observer.disconnect()
    }
  }, [descriptionPreviewText])

  const isDescriptionPopoverOpen = isDescriptionTruncated && isDescriptionExpanded

  function handleDescriptionZoneBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!isDescriptionTruncated) {
      return
    }

    const nextTarget = event.relatedTarget as Node | null
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsDescriptionExpanded(false)
    }
  }

  function handleEntryClick(event: React.MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (entryAction.disabled) {
      if (entryAction.reason) onError(entryAction.reason)
      return
    }
    if ('action' in entryAction) {
      if (entryAction.action === 'joinRequest') {
        onJoinRequest(campaign)
        return
      }
      if (entryAction.action === 'watch') {
        onWatchCampaign(campaign)
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
        isDescriptionPopoverOpen ? 'is-description-expanded' : '',
        isDimmed ? 'is-dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        cardPosterUrl
          ? {
              backgroundImage: `linear-gradient(rgba(9, 14, 24, 0.78), rgba(9, 14, 24, 0.78)), url(${cardPosterUrl})`,
            }
          : undefined
      }
    >
      <span className="session-campaign-card__header">
        <span className="session-campaign-card__title">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={`session-campaign-card__state-dot state-${state.toLowerCase()}`}
                role="img"
                aria-label={`Campaign ${getCampaignVisualStateLabel(state).toLowerCase()}`}
              />
            </TooltipTrigger>
            <TooltipContent side="top">{getCampaignVisualStateLabel(state)}</TooltipContent>
          </Tooltip>
          <span>{campaign.name}</span>
          {showLock && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Icon
                  name="lock"
                  className="session-campaign-card__lock-icon"
                  aria-label="Private campaign"
                />
              </TooltipTrigger>
              <TooltipContent side="top">Private campaign</TooltipContent>
            </Tooltip>
          )}
        </span>
        <span className="session-campaign-card__stats" aria-label="Campaign activity stats">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-campaign-card__stat">
                <Icon name="groups" />
                <span>{playersLabel}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Connected players</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="session-campaign-card__stat">
                <Icon name="visibility" />
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

      <div
        className="session-campaign-card__description-zone"
        onMouseEnter={isDescriptionTruncated ? () => setIsDescriptionExpanded(true) : undefined}
        onMouseLeave={isDescriptionTruncated ? () => setIsDescriptionExpanded(false) : undefined}
        onFocusCapture={isDescriptionTruncated ? () => setIsDescriptionExpanded(true) : undefined}
        onBlurCapture={isDescriptionTruncated ? handleDescriptionZoneBlur : undefined}
      >
        <div
          className={[
            'session-campaign-card__description',
            'session-campaign-card__description--preview',
            isDescriptionTruncated ? 'is-expandable' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label="Campaign description"
          tabIndex={isDescriptionTruncated ? 0 : -1}
        >
          <p ref={previewTextRef} className="session-campaign-card__description-preview-text">
            {descriptionPreviewText}
          </p>
        </div>
        <div
          className={`session-campaign-card__description-popover ${isDescriptionPopoverOpen ? 'is-open' : ''}`}
          aria-label="Expanded campaign description"
          aria-hidden={!isDescriptionPopoverOpen}
          tabIndex={isDescriptionPopoverOpen ? 0 : -1}
        >
          {renderCampaignDescription(campaign.description)}
        </div>
      </div>
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
                <Icon name="tune" />
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
          <LobbyJoinRequestsPanel
            campaignId={campaign.id}
            pendingCount={campaign.pendingJoinRequests ?? 0}
            onLoadPendingJoinRequests={onLoadPendingJoinRequests}
            onResolveJoinRequest={onResolveJoinRequest}
            onError={onError}
          />
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
