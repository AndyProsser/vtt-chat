import { useEffect, useMemo, useRef, useState } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { MessageMetadataEntity } from '@shared'
import { type Role, type UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import type { HistorySortOrder, SessionHistoryMessage, SessionHistoryThread } from '@/types/history'
import {
  DEFAULT_HISTORY_SORT_ORDER,
  getHistoryControlStorageKey,
  parsePersistedHistoryControls,
} from '@/utils/history'
import {
  HISTORY_MESSAGE_LIMIT,
  formatBoundaryDate,
  matchesQuery,
  toSessionLabel,
  toTimestamp,
} from './HistoryPanel.helpers'
import {
  HistoryPanelVirtualList,
  flattenHistoryGroupsToRows,
  type HistoryGroup,
} from './HistoryPanel.virtualized'
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

export function HistoryPanel({
  apiUrl,
  token,
  campaignId,
  sessionId,
  role,
  userId,
}: HistoryPanelProps) {
  const [threads, setThreads] = useState<SessionHistoryThread[]>([])
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const storageKey = useMemo(
    () => getHistoryControlStorageKey(sessionId, role, userId),
    [sessionId, role, userId]
  )
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
      setSortOrder(persisted.sortOrder)
    })
  }, [storageKey])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.localStorage?.setItem !== 'function') {
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify({ sortOrder }))
  }, [storageKey, sortOrder])

  useEffect(() => {
    let isDisposed = false

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
                authorCharacterName?: string | null
                content: string
                type: string
                isDmOnly?: boolean
                metadata?: MessageMetadataEntity | null
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
                authorCharacterName: message.authorCharacterName ?? undefined,
                content: message.content,
                type: message.type,
                isDmOnly: Boolean(message.isDmOnly),
                metadata: message.metadata ?? undefined,
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
          .filter((thread) => thread !== null)
          .filter((thread) => thread.messages.length > 0)

        if (isDisposed) {
          return
        }

        setThreads(nextThreads)
      } catch (err) {
        if (isDisposed) {
          return
        }

        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        if (!isDisposed) {
          setIsLoading(false)
        }
      }
    }

    void fetchPreviousSessionHistory()

    return () => {
      isDisposed = true
    }
  }, [apiUrl, campaignId, sessionId, token])

  const groupedHistory = useMemo<HistoryGroup[]>(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filteredThreads = threads
      .map((thread) => {
        const sortedMessages = [...thread.messages].sort((left, right) =>
          sortOrder === 'newest'
            ? right.createdAt - left.createdAt
            : left.createdAt - right.createdAt
        )
        const filteredMessages = sortedMessages.filter((message) =>
          matchesQuery(message, normalizedQuery)
        )

        return {
          ...thread,
          startedAtLabel: formatBoundaryDate(thread.startedAt || thread.createdAt),
          messages: filteredMessages,
        }
      })
      .filter((thread) => thread.messages.length > 0)

    const sortedThreads = [...filteredThreads].sort((left, right) => {
      const leftAnchor = left.startedAt || left.createdAt
      const rightAnchor = right.startedAt || right.createdAt
      return sortOrder === 'newest' ? rightAnchor - leftAnchor : leftAnchor - rightAnchor
    })

    return sortedThreads.map((thread) => ({
      label: toSessionLabel(thread),
      sessionId: thread.sessionId,
      sessionName: thread.sessionName,
      startedAtLabel: thread.startedAtLabel,
      items: thread.messages,
    }))
  }, [query, sortOrder, threads])

  const virtualRows = useMemo(
    () => flattenHistoryGroupsToRows(groupedHistory, userId),
    [groupedHistory, userId]
  )

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

      <div
        className="knowledge-panel-toolbar knowledge-panel-history__toolbar"
        aria-label="History controls"
      >
        <label className="knowledge-panel-filter-field" htmlFor="history-search-input">
          <span>Search</span>
          <div className="knowledge-panel-history__search-input-wrap">
            <input
              id="history-search-input"
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search messages, player names, handouts"
              autoComplete="off"
            />
            {query.length > 0 ? (
              <button
                type="button"
                className="knowledge-panel-history__search-clear"
                aria-label="Clear history search"
                onClick={() => {
                  setQuery('')
                  searchInputRef.current?.focus()
                }}
              >
                <Icon name="close" />
              </button>
            ) : null}
          </div>
        </label>

        <div className="knowledge-panel-filter-field">
          <span>Sort</span>
          <TabsPrimitive.Root
            value={sortOrder}
            onValueChange={(value) => setSortOrder(value as HistorySortOrder)}
            className="knowledge-panel-tabs knowledge-panel-history__sort-tabs"
          >
            <TabsPrimitive.List
              className="knowledge-panel-tabs__list knowledge-panel-history__sort-list"
              aria-label="History sort order"
            >
              <TabsPrimitive.Trigger
                value="newest"
                className="knowledge-panel-tabs__trigger knowledge-panel-history__sort-trigger"
                title="Newest first"
                aria-label="Sort by newest first"
              >
                <Icon name="south" />
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger
                value="oldest"
                className="knowledge-panel-tabs__trigger knowledge-panel-history__sort-trigger"
                title="Oldest first"
                aria-label="Sort by oldest first"
              >
                <Icon name="north" />
              </TabsPrimitive.Trigger>
            </TabsPrimitive.List>
          </TabsPrimitive.Root>
        </div>
      </div>

      <div className="knowledge-panel__content knowledge-panel-history__content workspace-panel-scroll-region">
        {virtualRows.length === 0 ? (
          <div className="knowledge-panel-empty" role="status">
            No results for that search.
          </div>
        ) : (
          <HistoryPanelVirtualList rows={virtualRows} />
        )}
      </div>
    </section>
  )
}
