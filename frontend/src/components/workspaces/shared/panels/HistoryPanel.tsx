import { useEffect, useMemo, useState } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { MessageType, type Role, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import type {
  HistoryGroupBy,
  HistorySortOrder,
  SessionHistoryMessage,
  SessionHistoryThread,
} from '@/types/history'
import {
  DEFAULT_HISTORY_GROUP_BY,
  DEFAULT_HISTORY_SORT_ORDER,
  getHistoryControlStorageKey,
  parsePersistedHistoryControls,
} from '@/utils/history'
import '@/styles/components/workspaces/session/chat/MessageList.messages.css'
import '@/styles/components/workspaces/session/chat/MessageList.timeline.css'
import '@/styles/components/workspaces/session/chat/MessageList.whisper-routes.css'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'

interface HistoryPanelProps {
  apiUrl: string
  token: string
  campaignId?: UUID
  sessionId: UUID
  role: Role
  userId?: UUID
}

const HISTORY_MESSAGE_LIMIT = 180
const GROUPING_WINDOW_MS = 5 * 60 * 1000
const SESSION_RECAP_PREFIX = '[Last Session]'
const CAMPAIGN_BRIEF_PREFIX = '[Campaign Brief]'

type SessionBookendState = 'started' | 'ended' | 'paused' | 'resumed' | 'cooldown'

const SESSION_BOOKEND_PREFIXES = [
  'Session Start:',
  'Session End:',
  '[Session Started]',
  '[Session Ended]',
  '[Session Paused]',
  '[Session Resumed]',
  '[Session Cooldown]',
]

const BOOKEND_META: Record<
  SessionBookendState,
  { label: string; icon: string; className: string }
> = {
  started: {
    label: 'STARTED',
    icon: 'play_circle',
    className: 'session-message-list__session-marker--started',
  },
  ended: {
    label: 'ENDED',
    icon: 'stop_circle',
    className: 'session-message-list__session-marker--ended',
  },
  paused: {
    label: 'PAUSED',
    icon: 'pause_circle',
    className: 'session-message-list__session-marker--paused',
  },
  resumed: {
    label: 'RESUMED',
    icon: 'play_circle',
    className: 'session-message-list__session-marker--resumed',
  },
  cooldown: {
    label: 'CLOSED',
    icon: 'theaters',
    className: 'session-message-list__session-marker--cooldown',
  },
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }

    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return Date.now()
}

function toDayLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function toSessionLabel(thread: SessionHistoryThread): string {
  const baseDate = thread.startedAt || thread.createdAt
  return `${thread.sessionName} · ${toDayLabel(baseDate)}`
}

function matchesQuery(message: SessionHistoryMessage, query: string): boolean {
  if (!query) {
    return true
  }

  const haystack = [
    message.authorUsername,
    message.content,
    String(message.type || ''),
    message.isDmOnly ? 'dm only' : '',
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

function toMessageVariant(type: string): 'ic' | 'ooc' | 'whisper' | 'dm' | 'system' {
  if (type === MessageType.IC) return 'ic'
  if (type === MessageType.WHISPER) return 'whisper'
  if (type === MessageType.DM) return 'dm'
  if (type === MessageType.SYSTEM) return 'system'
  return 'ooc'
}

function toTypeIcon(variant: 'ic' | 'ooc' | 'whisper' | 'dm' | 'system'): string {
  if (variant === 'ic') return 'swords'
  if (variant === 'whisper') return 'visibility_off'
  if (variant === 'dm') return 'mail'
  if (variant === 'system') return 'info'
  return 'chat_bubble'
}

function getAuthorInitial(username: string): string {
  return username.trim().charAt(0).toUpperCase() || '?'
}

function getSessionBookendState(content: string): SessionBookendState | null {
  if (content.startsWith('[Session Started]') || content.startsWith('Session Start:')) {
    return 'started'
  }
  if (content.startsWith('[Session Ended]') || content.startsWith('Session End:')) {
    return 'ended'
  }
  if (content.startsWith('[Session Paused]')) {
    return 'paused'
  }
  if (content.startsWith('[Session Resumed]')) {
    return 'resumed'
  }
  if (content.startsWith('[Session Cooldown]')) {
    return 'cooldown'
  }

  return null
}

function formatBookendTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function HistoryPanel({
  apiUrl,
  token,
  campaignId,
  sessionId,
  role,
  userId,
}: HistoryPanelProps) {
  const [threads, setThreads] = useState<SessionHistoryThread[]>([])
  const storageKey = useMemo(
    () => getHistoryControlStorageKey(sessionId, role, userId),
    [sessionId, role, userId]
  )
  const [groupBy, setGroupBy] = useState<HistoryGroupBy>(() => {
    if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
      return DEFAULT_HISTORY_GROUP_BY
    }
    return parsePersistedHistoryControls(window.localStorage.getItem(storageKey)).groupBy
  })
  const [sortOrder, setSortOrder] = useState<HistorySortOrder>(() => {
    if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
      return DEFAULT_HISTORY_SORT_ORDER
    }
    return parsePersistedHistoryControls(window.localStorage.getItem(storageKey)).sortOrder
  })
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
      return
    }

    const persisted = parsePersistedHistoryControls(window.localStorage.getItem(storageKey))
    queueMicrotask(() => {
      setGroupBy(persisted.groupBy)
      setSortOrder(persisted.sortOrder)
    })
  }, [storageKey])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage?.setItem !== 'function') {
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify({ groupBy, sortOrder }))
  }, [storageKey, groupBy, sortOrder])

  useEffect(() => {
    const abortController = new AbortController()

    const fetchPreviousSessionHistory = async () => {
      try {
        setIsLoading(true)
        setError(null)
        if (!campaignId) {
          setThreads([])
          return
        }

        const sessionResponse = await fetch(`${apiUrl}/api/campaigns/${campaignId}/sessions`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: abortController.signal,
        })

        if (!sessionResponse.ok) {
          throw new Error('Failed to load campaign sessions')
        }

        const sessionData = (await sessionResponse.json()) as {
          sessions?: Array<{
            id: UUID
            name: string
            state: string
            createdAt?: number | string
            startedAt?: number | string
            endedAt?: number | string
          }>
        }
        const previousSessions = (sessionData.sessions || []).filter(
          (session) => session.id !== sessionId
        )

        if (previousSessions.length === 0) {
          setThreads([])
          return
        }

        const chatThreads = await Promise.all(
          previousSessions.map(async (session) => {
            const params = new URLSearchParams()
            params.set('limit', String(HISTORY_MESSAGE_LIMIT))
            params.set('sinceLatestStart', '1')

            const historyResponse = await fetch(
              `${apiUrl}/api/chat/messages/${session.id}?${params.toString()}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
                signal: abortController.signal,
              }
            )

            if (!historyResponse.ok) {
              return null
            }

            const historyData = (await historyResponse.json()) as {
              messages?: Array<{
                id: string
                sessionId: string
                roomId?: string
                authorId: string
                authorUsername?: string
                content: string
                type: string
                isDmOnly?: boolean
                createdAt: string | number
              }>
            }

            const messages: SessionHistoryMessage[] = (historyData.messages || [])
              .filter(
                (message) =>
                  typeof message.content === 'string' && message.content.trim().length > 0
              )
              .map((message) => ({
                id: message.id,
                sessionId: message.sessionId,
                roomId: message.roomId,
                authorId: message.authorId,
                authorUsername: message.authorUsername || 'Unknown',
                content: message.content,
                type: message.type,
                isDmOnly: Boolean(message.isDmOnly),
                createdAt: toTimestamp(message.createdAt),
              }))

            return {
              sessionId: session.id,
              sessionName: session.name,
              sessionState: session.state,
              createdAt: toTimestamp(session.createdAt),
              startedAt: session.startedAt ? toTimestamp(session.startedAt) : undefined,
              endedAt: session.endedAt ? toTimestamp(session.endedAt) : undefined,
              messages,
            } satisfies SessionHistoryThread
          })
        )

        const nextThreads = chatThreads
          .filter((thread): thread is SessionHistoryThread => Boolean(thread))
          .filter((thread) => thread.messages.length > 0)

        setThreads(nextThreads)
      } catch (err) {
        if (abortController.signal.aborted) {
          return
        }

        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void fetchPreviousSessionHistory()

    return () => {
      abortController.abort()
    }
  }, [apiUrl, campaignId, sessionId, token])

  const groupedHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filteredThreads = threads
      .map((thread) => {
        const sortedMessages = [...thread.messages].sort((left, right) =>
          sortOrder === 'newest'
            ? right.createdAt - left.createdAt
            : left.createdAt - right.createdAt
        )

        return {
          ...thread,
          messages: sortedMessages.filter((message) => matchesQuery(message, normalizedQuery)),
        }
      })
      .filter((thread) => thread.messages.length > 0)

    const sortedThreads = [...filteredThreads].sort((left, right) => {
      const leftAnchor = left.startedAt || left.createdAt
      const rightAnchor = right.startedAt || right.createdAt
      return sortOrder === 'newest' ? rightAnchor - leftAnchor : leftAnchor - rightAnchor
    })

    if (groupBy === 'session') {
      return sortedThreads.map((thread) => ({
        label: toSessionLabel(thread),
        sessionId: thread.sessionId,
        sessionName: thread.sessionName,
        sessionState: thread.sessionState,
        items: thread.messages,
      }))
    }

    const groups = new Map<
      string,
      {
        label: string
        sessionId: string
        sessionName: string
        sessionState: string
        items: SessionHistoryMessage[]
      }
    >()

    for (const thread of sortedThreads) {
      for (const message of thread.messages) {
        const key = toDayLabel(message.createdAt)
        const existing = groups.get(key)
        if (!existing) {
          groups.set(key, {
            label: key,
            sessionId: thread.sessionId,
            sessionName: thread.sessionName,
            sessionState: thread.sessionState,
            items: [message],
          })
          continue
        }

        existing.items.push(message)
      }
    }

    const withSortedItems = Array.from(groups.values()).map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) =>
        sortOrder === 'newest' ? right.createdAt - left.createdAt : left.createdAt - right.createdAt
      ),
    }))

    return withSortedItems
  }, [groupBy, query, sortOrder, threads])

  if (isLoading) {
    return (
      <section className="knowledge-panel" aria-label="History" data-testid="history-panel">
        <h3 className="knowledge-panel__heading">
          <Icon name="history" />
          History
        </h3>
        <p className="knowledge-panel__empty">Loading history…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="knowledge-panel" aria-label="History" data-testid="history-panel">
        <h3 className="knowledge-panel__heading">
          <Icon name="history" />
          History
        </h3>
        <p className="knowledge-panel__empty">{error}</p>
      </section>
    )
  }

  if (threads.length === 0) {
    return (
      <section className="knowledge-panel" aria-label="History" data-testid="history-panel">
        <h3 className="knowledge-panel__heading">
          <Icon name="history" />
          History
        </h3>
        <div className="ui-empty-panel" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">
            history
          </span>
          <span>No previous session chat yet.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="knowledge-panel" aria-label="History" data-testid="history-panel">
      <h3 className="knowledge-panel__heading">
        <Icon name="history" />
        History
      </h3>
      <p className="knowledge-panel-subtitle">
        Previous sessions only. Search quotes, handout mentions, and key reveals.
      </p>

      <div className="knowledge-panel-toolbar" aria-label="History controls">
        <label className="knowledge-panel-filter-field" htmlFor="history-search-input">
          <span>Search</span>
          <input
            id="history-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search messages, player names, handouts"
            autoComplete="off"
          />
        </label>

        <div className="knowledge-panel-filter-field">
          <span>Group by</span>
          <TabsPrimitive.Root
            value={groupBy}
            onValueChange={(value) => setGroupBy(value as HistoryGroupBy)}
            className="knowledge-panel-tabs"
          >
            <TabsPrimitive.List
              className="knowledge-panel-tabs__list"
              aria-label="History grouping"
            >
              <TabsPrimitive.Trigger value="session" className="knowledge-panel-tabs__trigger">
                Session
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger value="day" className="knowledge-panel-tabs__trigger">
                Day
              </TabsPrimitive.Trigger>
            </TabsPrimitive.List>
          </TabsPrimitive.Root>
        </div>

        <div className="knowledge-panel-filter-field">
          <span>Sort</span>
          <TabsPrimitive.Root
            value={sortOrder}
            onValueChange={(value) => setSortOrder(value as HistorySortOrder)}
            className="knowledge-panel-tabs"
          >
            <TabsPrimitive.List
              className="knowledge-panel-tabs__list"
              aria-label="History sort order"
            >
              <TabsPrimitive.Trigger value="newest" className="knowledge-panel-tabs__trigger">
                Newest
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger value="oldest" className="knowledge-panel-tabs__trigger">
                Oldest
              </TabsPrimitive.Trigger>
            </TabsPrimitive.List>
          </TabsPrimitive.Root>
        </div>
      </div>

      <div className="knowledge-panel__content knowledge-panel-history__content">
        {groupedHistory.length === 0 ? (
          <div className="knowledge-panel-empty" role="status">
            No results for that search.
          </div>
        ) : null}

        {groupedHistory.map(
          ({ label, items, sessionId: groupSessionId, sessionName, sessionState }) => (
            <div key={label} className="knowledge-panel__day-group">
              <div className="session-message-list__day-separator" aria-label={label}>
                <span className="session-message-list__day-separator-line" aria-hidden="true" />
                <span className="session-message-list__day-separator-pill">{label}</span>
                <span className="session-message-list__day-separator-line" aria-hidden="true" />
              </div>
              <div className="knowledge-panel-history__session-meta">
                <span>{sessionName}</span>
                <span>{sessionState}</span>
                <span>{items.length} matches</span>
              </div>
              <ul className="knowledge-panel-history__message-list">
                {items.map((message, index) => {
                  const previous = index > 0 ? items[index - 1] : undefined
                  const isSystem = message.type === MessageType.SYSTEM
                  const recapPrefix = message.content.startsWith(CAMPAIGN_BRIEF_PREFIX)
                    ? CAMPAIGN_BRIEF_PREFIX
                    : SESSION_RECAP_PREFIX
                  const isSessionRecap = isSystem && message.content.startsWith(recapPrefix)
                  const isSessionBookend =
                    isSystem &&
                    SESSION_BOOKEND_PREFIXES.some((prefix) => message.content.startsWith(prefix))
                  const sessionBookendState = isSessionBookend
                    ? getSessionBookendState(message.content)
                    : null
                  const isGroupedWithPrevious = Boolean(
                    previous &&
                    previous.authorId === message.authorId &&
                    Math.abs(message.createdAt - previous.createdAt) <= GROUPING_WINDOW_MS
                  )
                  const isSelf = message.authorId === userId
                  const variant = toMessageVariant(message.type)

                  if (isSessionRecap) {
                    const recapBody = message.content.slice(recapPrefix.length).trim()
                    const recapLabel =
                      recapPrefix === CAMPAIGN_BRIEF_PREFIX ? 'Campaign Brief' : 'Last Session'

                    return (
                      <li key={`${groupSessionId}:${message.id}`}>
                        <article className="session-message-list__session-recap">
                          <span
                            className="session-message-list__session-recap-icon material-symbols-outlined"
                            aria-hidden="true"
                          >
                            menu_book
                          </span>
                          <div className="session-message-list__session-recap-body">
                            <span className="session-message-list__session-recap-label">
                              {recapLabel}
                            </span>
                            <p className="session-message-list__session-recap-text">{recapBody}</p>
                          </div>
                        </article>
                      </li>
                    )
                  }

                  if (isSessionBookend && sessionBookendState) {
                    const markerMeta = BOOKEND_META[sessionBookendState]
                    return (
                      <li key={`${groupSessionId}:${message.id}`}>
                        <article
                          className={`session-message-list__session-marker session-message-list__session-marker--bookend ${markerMeta.className}`}
                        >
                          <div className="session-message-list__session-marker-content">
                            <div className="session-message-list__session-marker-label-row">
                              <span
                                className="session-message-list__session-marker-line"
                                aria-hidden="true"
                              />
                              <span className="session-message-list__session-marker-badge">
                                <span
                                  className="session-message-list__session-marker-icon material-symbols-outlined"
                                  aria-hidden="true"
                                >
                                  {markerMeta.icon}
                                </span>
                                <span className="session-message-list__session-marker-text">
                                  {markerMeta.label}
                                </span>
                                <span
                                  className="session-message-list__session-marker-icon material-symbols-outlined"
                                  aria-hidden="true"
                                >
                                  {markerMeta.icon}
                                </span>
                              </span>
                              <span
                                className="session-message-list__session-marker-line"
                                aria-hidden="true"
                              />
                            </div>
                            <time
                              className="session-message-list__session-marker-time"
                              dateTime={new Date(message.createdAt).toISOString()}
                            >
                              {formatBookendTimestamp(message.createdAt)}
                            </time>
                          </div>
                        </article>
                      </li>
                    )
                  }

                  return (
                    <li key={`${groupSessionId}:${message.id}`}>
                      <article
                        className={`session-message-list__message ${isSelf ? 'session-message-list__message--self' : ''} ${isGroupedWithPrevious ? 'session-message-list__message--grouped' : ''}`}
                      >
                        <div className="session-message-list__message-row">
                          {!isSelf && !isGroupedWithPrevious ? (
                            <span
                              className={`session-message-list__message-avatar ${variant === 'system' ? 'session-message-list__message-avatar--system' : ''}`}
                              aria-hidden="true"
                            >
                              {getAuthorInitial(message.authorUsername)}
                            </span>
                          ) : (
                            <span
                              className="session-message-list__message-avatar session-message-list__message-avatar--spacer"
                              aria-hidden="true"
                            />
                          )}

                          <div className="session-message-list__message-content">
                            {!isGroupedWithPrevious ? (
                              <div className="session-message-list__message-meta">
                                <span className="session-message-list__message-author">
                                  {message.authorUsername}
                                </span>
                              </div>
                            ) : null}

                            <div
                              className={`session-message-list__message-bubble session-message-list__message-bubble--${variant} ${isSelf ? 'session-message-list__message-bubble--self' : ''}`}
                            >
                              <span
                                className={`session-message-list__message-type-icon session-message-list__message-type-icon--${variant} material-symbols-outlined`}
                                aria-hidden="true"
                              >
                                {toTypeIcon(variant)}
                              </span>
                              <span className="session-message-list__message-bubble-text">
                                {message.content}
                              </span>
                            </div>

                            <div className="session-message-list__message-footer">
                              <span className="session-message-list__message-timestamp">
                                {new Date(message.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        )}
      </div>
    </section>
  )
}
