import { useEffect, useMemo, useState } from 'react'
import type { Role, UUID } from '@shared'
import '../../styles/components/session/KnowledgePanels.css'

interface HistoryPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  role: Role
  userId?: UUID
}

interface SessionLogEntry {
  id: string
  sessionId: string
  userId: string | null
  username: string
  eventType: string
  detail: string | null
  createdAt: string
}

function formatEventLabel(eventType: string): string {
  return eventType
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

export function HistoryPanel({ apiUrl, token, sessionId, role }: HistoryPanelProps) {
  const [logs, setLogs] = useState<SessionLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await fetch(`${apiUrl}/api/v1/session/${sessionId}/logs`, {
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

  // Group logs by day for display
  const groupedLogs = useMemo(() => {
    const groups = new Map<string, SessionLogEntry[]>()

    for (const log of logs) {
      const dayLabel = new Date(log.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })

      const dayLogs = groups.get(dayLabel) ?? []
      dayLogs.push(log)
      groups.set(dayLabel, dayLogs)
    }

    return Array.from(groups.entries()).map(([dayLabel, items]) => ({ dayLabel, items }))
  }, [logs])

  if (isLoading) {
    return (
      <section className="knowledge-panel" aria-label="History">
        <h3 className="knowledge-panel__heading">History</h3>
        <p className="knowledge-panel__empty">Loading history…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="knowledge-panel" aria-label="History">
        <h3 className="knowledge-panel__heading">History</h3>
        <p className="knowledge-panel__empty">{error}</p>
      </section>
    )
  }

  if (logs.length === 0) {
    return (
      <section className="knowledge-panel" aria-label="History">
        <h3 className="knowledge-panel__heading">History</h3>
        <p className="knowledge-panel__empty">No history yet.</p>
      </section>
    )
  }

  return (
    <section className="knowledge-panel" aria-label="History">
      <h3 className="knowledge-panel__heading">History</h3>
      <div className="knowledge-panel__content">
        {groupedLogs.map(({ dayLabel, items }) => (
          <div key={dayLabel} className="knowledge-panel__day-group">
            <h4 className="knowledge-panel__day-label">{dayLabel}</h4>
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
