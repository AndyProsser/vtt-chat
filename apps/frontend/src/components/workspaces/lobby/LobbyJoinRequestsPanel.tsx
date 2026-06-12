import { useCallback, useMemo, useState } from 'react'
import type { UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import type { CampaignJoinRequestSummary } from '@/types/session/campaign'

type LobbyJoinRequestsPanelProps = {
  campaignId: UUID
  pendingCount: number
  onLoadPendingJoinRequests: (campaignId: UUID) => Promise<CampaignJoinRequestSummary[]>
  onResolveJoinRequest: (
    campaignId: UUID,
    requestId: UUID,
    resolution: 'APPROVED' | 'REJECTED'
  ) => Promise<void>
  onError: (message: string) => void
}

function formatRequestedAtLabel(value: number | string): string {
  const numeric = typeof value === 'number' ? value : Date.parse(String(value))
  if (!Number.isFinite(numeric)) {
    return 'Requested recently'
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(numeric))
  } catch {
    return 'Requested recently'
  }
}

export function LobbyJoinRequestsPanel(props: LobbyJoinRequestsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [requests, setRequests] = useState<CampaignJoinRequestSummary[]>([])
  const [activeRequestId, setActiveRequestId] = useState<UUID | null>(null)

  const visibleRequests = useMemo(() => requests.slice(0, 8), [requests])

  const loadRequests = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)

    try {
      const nextRequests = await props.onLoadPendingJoinRequests(props.campaignId)
      setRequests(nextRequests)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load join requests'
      setLoadError(message)
      props.onError(message)
    } finally {
      setIsLoading(false)
    }
  }, [props])

  const handleToggle = useCallback(async () => {
    const nextOpen = !isOpen
    setIsOpen(nextOpen)
    if (!nextOpen) {
      return
    }

    if (requests.length !== props.pendingCount || loadError) {
      await loadRequests()
    }
  }, [isOpen, loadError, loadRequests, props.pendingCount, requests.length])

  const handleResolve = useCallback(
    async (requestId: UUID, resolution: 'APPROVED' | 'REJECTED') => {
      setActiveRequestId(requestId)

      try {
        await props.onResolveJoinRequest(props.campaignId, requestId, resolution)
        setRequests((current) => current.filter((request) => request.id !== requestId))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to resolve join request'
        props.onError(message)
      } finally {
        setActiveRequestId(null)
      }
    },
    [props]
  )

  return (
    <div className="session-campaign-join-requests">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="session-card-action-button session-card-action-button--badge"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void handleToggle()
            }}
            aria-label={`${props.pendingCount} pending join requests`}
            aria-expanded={isOpen}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              person_add
            </span>
            <span className="session-card-action-button__badge">{props.pendingCount}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {props.pendingCount} pending join {props.pendingCount === 1 ? 'request' : 'requests'}
        </TooltipContent>
      </Tooltip>

      {isOpen ? (
        <div
          className="session-campaign-join-requests__panel"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          <div className="session-campaign-join-requests__panel-header">
            <div>
              <strong>Pending join requests</strong>
              <p>Review public-campaign requests without leaving the lobby.</p>
            </div>
            <button
              type="button"
              className="session-icon-action session-icon-action--icon"
              onClick={() => {
                setIsOpen(false)
              }}
              aria-label="Close join request panel"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          {isLoading ? <div className="workspaces-status-message">Loading requests...</div> : null}
          {!isLoading && loadError ? (
            <div className="workspaces-status-message">{loadError}</div>
          ) : null}
          {!isLoading && !loadError && visibleRequests.length === 0 ? (
            <div className="workspaces-status-message">No pending requests.</div>
          ) : null}

          {!isLoading && !loadError && visibleRequests.length > 0 ? (
            <div className="session-campaign-join-requests__list" role="list">
              {visibleRequests.map((request) => {
                const isResolving = activeRequestId === request.id

                return (
                  <article
                    key={request.id}
                    className="session-campaign-join-requests__item"
                    role="listitem"
                  >
                    <div className="session-campaign-join-requests__identity">
                      {request.avatarUrl ? (
                        <img
                          src={request.avatarUrl}
                          alt={`${request.displayName} avatar`}
                          className="session-campaign-join-requests__avatar"
                        />
                      ) : (
                        <span className="session-campaign-join-requests__avatar session-campaign-join-requests__avatar--fallback">
                          {request.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="session-campaign-join-requests__identity-copy">
                        <strong>{request.displayName}</strong>
                        <span>@{request.username}</span>
                        <time>{formatRequestedAtLabel(request.requestedAt)}</time>
                      </div>
                    </div>

                    {request.message ? (
                      <p className="session-campaign-join-requests__message">{request.message}</p>
                    ) : (
                      <p className="session-campaign-join-requests__message session-campaign-join-requests__message--muted">
                        No message attached.
                      </p>
                    )}

                    <div className="session-campaign-join-requests__actions">
                      <button
                        type="button"
                        className="session-card-action-button"
                        disabled={isResolving}
                        onClick={() => {
                          void handleResolve(request.id, 'REJECTED')
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          close
                        </span>
                        <span>{isResolving ? 'Working...' : 'Reject'}</span>
                      </button>
                      <button
                        type="button"
                        className="session-card-action-button session-card-action-button--approve"
                        disabled={isResolving}
                        onClick={() => {
                          void handleResolve(request.id, 'APPROVED')
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true">
                          check
                        </span>
                        <span>{isResolving ? 'Working...' : 'Approve'}</span>
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
