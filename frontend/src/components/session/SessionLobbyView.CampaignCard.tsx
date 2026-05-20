/**
 * CampaignCard sub-component for SessionLobbyView.
 *
 * Renders a single campaign card in the lobby list. Supports both member cards
 * and discoverable non-member cards (dimmed/lock/request-to-join/watch flows).
 */

import { Tooltip, TooltipContent, TooltipTrigger } from '../../core-ui'
import { useState } from 'react'
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

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null = tokenRegex.exec(text)

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{token.slice(1, -1)}</em>)
    } else {
      nodes.push(token)
    }

    lastIndex = match.index + token.length
    match = tokenRegex.exec(text)
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

function renderCampaignDescription(markdown?: string | null): React.ReactNode {
  const source = (markdown || '').trim()
  if (!source) {
    return <p>No description provided.</p>
  }

  const lines = source.split(/\r?\n/)
  const nodes: React.ReactNode[] = []
  let paragraphBuffer: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return
    }

    const text = paragraphBuffer.join(' ').trim()
    if (text) {
      nodes.push(<p key={`p-${nodes.length}`}>{renderInlineMarkdown(text, `p-${nodes.length}`)}</p>)
    }
    paragraphBuffer = []
  }

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      return
    }

    const listKey = `${listType}-${nodes.length}`
    const listChildren = listItems.map((item, index) => (
      <li key={`${listKey}-item-${index}`}>{renderInlineMarkdown(item, `${listKey}-${index}`)}</li>
    ))

    nodes.push(
      listType === 'ul' ? (
        <ul key={listKey}>{listChildren}</ul>
      ) : (
        <ol key={listKey}>{listChildren}</ol>
      )
    )
    listType = null
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const ulMatch = line.match(/^-\s+(.+)$/)
    const olMatch = line.match(/^\d+\.\s+(.+)$/)

    if (ulMatch || olMatch) {
      flushParagraph()
      const nextType: 'ul' | 'ol' = ulMatch ? 'ul' : 'ol'
      if (listType && listType !== nextType) {
        flushList()
      }
      listType = nextType
      listItems.push((ulMatch?.[1] || olMatch?.[1] || '').trim())
      continue
    }

    flushList()
    paragraphBuffer.push(line)
  }

  flushParagraph()
  flushList()

  return nodes.length > 0 ? nodes : <p>No description provided.</p>
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
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
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

  function handleDescriptionZoneBlur(event: React.FocusEvent<HTMLDivElement>) {
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
        isDescriptionExpanded ? 'is-description-expanded' : '',
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
                aria-label={`Campaign ${getCampaignVisualStateLabel(state).toLowerCase()}`}
              />
            </TooltipTrigger>
            <TooltipContent side="top">{getCampaignVisualStateLabel(state)}</TooltipContent>
          </Tooltip>
          <span>{campaign.name}</span>
          {showLock && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="material-symbols-outlined session-campaign-card__lock-icon"
                  aria-label="Private campaign"
                >
                  lock
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">Private campaign</TooltipContent>
            </Tooltip>
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

      <div
        className="session-campaign-card__description-zone"
        onMouseEnter={() => setIsDescriptionExpanded(true)}
        onMouseLeave={() => setIsDescriptionExpanded(false)}
        onFocusCapture={() => setIsDescriptionExpanded(true)}
        onBlurCapture={handleDescriptionZoneBlur}
      >
        <div
          className="session-campaign-card__description session-campaign-card__description--preview"
          aria-label="Campaign description"
          tabIndex={0}
          aria-expanded={isDescriptionExpanded}
        >
          {renderCampaignDescription(campaign.description)}
        </div>
        {isDescriptionExpanded ? (
          <div
            className="session-campaign-card__description-popover"
            aria-label="Expanded campaign description"
            tabIndex={0}
          >
            {renderCampaignDescription(campaign.description)}
          </div>
        ) : null}
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
