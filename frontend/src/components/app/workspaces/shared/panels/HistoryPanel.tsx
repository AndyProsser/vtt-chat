import { useEffect, useMemo, useState } from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { Role, UUID } from '@shared'
import type { HistoryGroupBy, HistorySortOrder, SessionLogEntry } from '@/types/history'
import {
  DEFAULT_HISTORY_GROUP_BY,
  DEFAULT_HISTORY_SORT_ORDER,
  formatEventLabel,
  getHistoryControlStorageKey,
  parsePersistedHistoryControls,
} from '@/utils/history'
import '@/styles/components/session/KnowledgePanels.css'

interface HistoryPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  role: Role
  userId?: UUID
}

export function HistoryPanel({ apiUrl, token, sessionId, role, userId }: HistoryPanelProps) {
  const [logs, setLogs] = useState<SessionLogEntry[]>([])
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
    const fetchLogs = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await fetch(`${apiUrl}/api/session/${sessionId}/logs`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load session history')
        }

        const data = await response.json()
        setLogs(data.logs || [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLogs()
  }, [apiUrl, token, sessionId])

  const groupedLogs = useMemo(() => {
    const sortedLogs = [...logs].sort((left, right) => {
      const leftMs = new Date(left.createdAt).getTime()
      const rightMs = new Date(right.createdAt).getTime()
      return sortOrder === 'newest' ? rightMs - leftMs : leftMs - rightMs
    })

    const groups = new Map<string, SessionLogEntry[]>()

    for (const log of sortedLogs) {
      const groupKey =
        groupBy === 'day'
          ? new Date(log.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : formatEventLabel(log.eventType)

      const groupLogs = groups.get(groupKey) ?? []
      groupLogs.push(log)
      groups.set(groupKey, groupLogs)
    }

    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
  }, [groupBy, logs, sortOrder])

  if (isLoading) {
    return (
      <section className="knowledge-panel" aria-label="History" data-testid="history-panel">
        <h3 className="knowledge-panel__heading">History</h3>
        <p className="knowledge-panel__empty">Loading history…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="knowledge-panel" aria-label="History" data-testid="history-panel">
        <h3 className="knowledge-panel__heading">History</h3>
        <p className="knowledge-panel__empty">{error}</p>
      </section>
    )
  }

  if (logs.length === 0) {
    return (
      <section className="knowledge-panel" aria-label="History" data-testid="history-panel">
        <h3 className="knowledge-panel__heading">History</h3>
        <p className="knowledge-panel__empty">No history yet.</p>
      </section>
    )
  }

  return (
    <section className="knowledge-panel" aria-label="History" data-testid="history-panel">
      <h3 className="knowledge-panel__heading">History</h3>

      <div className="knowledge-panel-toolbar" aria-label="History controls">
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
              <TabsPrimitive.Trigger value="day" className="knowledge-panel-tabs__trigger">
                Day
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger value="event" className="knowledge-panel-tabs__trigger">
                Event
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

      <div className="knowledge-panel__content">
        {groupedLogs.map(({ label, items }) => (
          <div key={label} className="knowledge-panel__day-group">
            <h4 className="knowledge-panel__day-label">{label}</h4>
            <ul className="knowledge-panel__event-list">
              {items.map((log) => (
                <li key={log.id} className="knowledge-panel__event-item">
                  <span className="knowledge-panel__event-label">
                    {formatEventLabel(log.eventType)}
                  </span>
                  <span className="knowledge-panel__event-actor">{log.username}</span>
                  {log.detail && (
                    <span className="knowledge-panel__event-detail">{log.detail}</span>
                  )}
                  <span className="knowledge-panel__event-time">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
