import { useEffect, useMemo, useState } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { Role, UUID } from '@shared'
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
              <h4 className="knowledge-panel__day-label">{label}</h4>
              <div className="knowledge-panel-history__session-meta">
                <span>{sessionName}</span>
                <span>{sessionState}</span>
                <span>{items.length} matches</span>
              </div>
              <ul className="knowledge-panel__event-list">
                {items.map((message) => (
                  <li
                    key={`${groupSessionId}:${message.id}`}
                    className="knowledge-panel__event-item"
                  >
                    <span className="knowledge-panel__event-label">{message.authorUsername}</span>
                    <span className="knowledge-panel__event-actor">
                      {String(message.type || 'MESSAGE')}
                    </span>
                    <span className="knowledge-panel__event-detail knowledge-panel-history__message-body">
                      {message.content}
                    </span>
                    <span className="knowledge-panel__event-time">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}
      </div>
    </section>
  )
}
