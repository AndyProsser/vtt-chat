import { useEffect, useState } from 'react'
import type { Role, UUID } from '@shared'
import '../../styles/components/session/Stage11Panels.css'

interface HistoryPanelProps {
  apiUrl: string
  token: string
  sessionId: UUID
  role: Role
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
  const [events, setEvents] = useState<SessionLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${apiUrl}/api/session/${sessionId}/logs?limit=25`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()

        if (!cancelled) {
          setEvents(data.logs || [])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load history')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadHistory()

    return () => {
      cancelled = true
    }
  }, [apiUrl, sessionId, token])

  return (
    <section className="knowledge-panel" data-testid="history-panel">
      <header className="knowledge-panel-header">
        <div>
          <p className="knowledge-panel-eyebrow">Stage 11</p>
          <h3 className="knowledge-panel-title">History</h3>
        </div>
        <span className="knowledge-panel-badge">
          {role === 'DM' ? 'Live timeline' : 'Read only'}
        </span>
      </header>

      <p className="knowledge-panel-copy">
        Session lifecycle events and participation history from the persisted session log.
      </p>

      {isLoading ? <p className="knowledge-panel-meta">Loading timeline…</p> : null}
      {error ? <p className="knowledge-panel-error">{error}</p> : null}

      {!isLoading && events.length === 0 ? (
        <div className="knowledge-panel-empty">
          <p>No history events</p>
        </div>
      ) : (
        <div className="knowledge-panel-results" role="list" aria-label="History events">
          {events.map((event) => (
            <article key={event.id} className="knowledge-panel-card timeline" role="listitem">
              <div className="knowledge-panel-card-header">
                <div>
                  <p className="knowledge-panel-card-title">{formatEventLabel(event.eventType)}</p>
                  <p className="knowledge-panel-card-subtitle">
                    {event.username} • {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="knowledge-panel-chip">{event.eventType}</span>
              </div>
              <p className="knowledge-panel-card-body">{event.detail || 'No additional detail.'}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
