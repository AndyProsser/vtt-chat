import { useEffect, useMemo, useState } from 'react'
import type { Role, UUID } from '@shared'
import '../../styles/components/session/KnowledgePanels.css'

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

type HistoryWindow = '1h' | '6h' | '24h' | '7d' | 'all'

function formatEventLabel(eventType: string): string {
  return eventType
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function getWindowDurationMs(windowValue: HistoryWindow): number | null {
  switch (windowValue) {
    case '1h':
      return 60 * 60 * 1000
    case '6h':
      return 6 * 60 * 60 * 1000
    case '24h':
      return 24 * 60 * 60 * 1000
    case '7d':
      return 7 * 24 * 60 * 60 * 1000
    case 'all':
      return null
    default:
      return 24 * 60 * 60 * 1000
  }
}

function groupByDay(
  events: SessionLogEntry[]
): Array<{ dayLabel: string; items: SessionLogEntry[] }> {
  const groups = new Map<string, SessionLogEntry[]>()

  for (const event of events) {
    const dayLabel = new Date(event.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })

    const dayEvents = groups.get(dayLabel) ?? []
    dayEvents.push(event)
    groups.set(dayLabel, dayEvents)
  }

  return Array.from(groups.entries()).map(([dayLabel, items]) => ({ dayLabel, items }))
}

export function HistoryPanel({ apiUrl, token, sessionId, role }: HistoryPanelProps) {
  const [events, setEvents] = useState<SessionLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEventType, setSelectedEventType] = useState<string>('all')
  const [selectedActor, setSelectedActor] = useState<string>('all')
  const [selectedWindow, setSelectedWindow] = useState<HistoryWindow>('all')

  useEffect(() => {
    let cancelled = false

    const loadHistory = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`${apiUrl}/api/session/${sessionId}/logs?limit=100`, {
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

  const eventTypeOptions = useMemo(() => {
    return Array.from(new Set(events.map((event) => event.eventType))).sort((left, right) =>
      left.localeCompare(right)
    )
  }, [events])

  const actorOptions = useMemo(() => {
    return Array.from(new Set(events.map((event) => event.username))).sort((left, right) =>
      left.localeCompare(right)
    )
  }, [events])

  const filteredEvents = useMemo(() => {
    const windowDurationMs = getWindowDurationMs(selectedWindow)
    const threshold = windowDurationMs === null ? null : Date.now() - windowDurationMs

    return events.filter((event) => {
      if (selectedEventType !== 'all' && event.eventType !== selectedEventType) {
        return false
      }

      if (selectedActor !== 'all' && event.username !== selectedActor) {
        return false
      }

      if (threshold !== null) {
        const createdAt = Date.parse(event.createdAt)
        if (Number.isFinite(createdAt) && createdAt < threshold) {
          return false
        }
      }

      return true
    })
  }, [events, selectedActor, selectedEventType, selectedWindow])

  const groupedEvents = useMemo(() => groupByDay(filteredEvents), [filteredEvents])

  return (
    <section className="knowledge-panel" data-testid="history-panel">
      <header className="knowledge-panel-header">
        <div>
          <p className="knowledge-panel-eyebrow">Knowledge</p>
          <h3 className="knowledge-panel-title">History</h3>
        </div>
        <span className="knowledge-panel-badge">
          {role === 'DM' ? 'Live timeline' : 'Read only'}
        </span>
      </header>

      <p className="knowledge-panel-copy">
        Session lifecycle events and participation history from the persisted session log.
      </p>

      <div className="knowledge-panel-toolbar" aria-label="History filters">
        <label className="knowledge-panel-filter-field">
          <span>Event type</span>
          <select
            aria-label="Event type"
            value={selectedEventType}
            onChange={(event) => setSelectedEventType(event.target.value)}
          >
            <option value="all">All events</option>
            {eventTypeOptions.map((eventType) => (
              <option key={eventType} value={eventType}>
                {formatEventLabel(eventType)}
              </option>
            ))}
          </select>
        </label>

        <label className="knowledge-panel-filter-field">
          <span>Actor</span>
          <select
            aria-label="Actor"
            value={selectedActor}
            onChange={(event) => setSelectedActor(event.target.value)}
          >
            <option value="all">All actors</option>
            {actorOptions.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </label>

        <label className="knowledge-panel-filter-field">
          <span>Time window</span>
          <select
            aria-label="Time window"
            value={selectedWindow}
            onChange={(event) => setSelectedWindow(event.target.value as HistoryWindow)}
          >
            <option value="1h">Last hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="all">All time</option>
          </select>
        </label>
      </div>

      {!isLoading ? (
        <p className="knowledge-panel-meta">
          Showing {filteredEvents.length} events after filters.
        </p>
      ) : null}

      {isLoading ? <p className="knowledge-panel-meta">Loading timeline…</p> : null}
      {error ? <p className="knowledge-panel-error">{error}</p> : null}

      {!isLoading && filteredEvents.length === 0 ? (
        <div className="knowledge-panel-empty">
          <p>No history events match the active filters.</p>
        </div>
      ) : (
        <div className="knowledge-panel-results" aria-label="History events">
          {groupedEvents.map((group) => (
            <section key={group.dayLabel} className="knowledge-panel-group" role="group">
              <h4 className="knowledge-panel-group-title">{group.dayLabel}</h4>
              <div role="list" aria-label={`History events for ${group.dayLabel}`}>
                {group.items.map((event) => (
                  <article key={event.id} className="knowledge-panel-card timeline" role="listitem">
                    <div className="knowledge-panel-card-header">
                      <div>
                        <p className="knowledge-panel-card-title">
                          {formatEventLabel(event.eventType)}
                        </p>
                        <p className="knowledge-panel-card-subtitle">
                          {event.username} • {new Date(event.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="knowledge-panel-chip">{event.eventType}</span>
                    </div>
                    <p className="knowledge-panel-card-body">
                      {event.detail || 'No additional detail.'}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
