import { useEffect, useState } from 'react'
import { getJson } from '../utils/api'

interface DashboardTelemetry {
  activeUsers: number
  activeRooms: number
  recentErrors: number
  systemLoadPercent: number
  messageThroughputPerMinute: number
  storageUsagePercent: number
  totalUsers: number
  suspendedUsers: number
  activeCampaigns: number
  recentModerationActions: number
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardTelemetry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getJson<DashboardTelemetry>('/telemetry/dashboard', controller.signal)
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard telemetry')
      } finally {
        setLoading(false)
      }
    }

    void load()
    const interval = setInterval(() => void load(), 15_000)

    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [])

  return (
    <section className="admin-page">
      <h2 className="admin-page-title">Dashboard</h2>
      <p className="admin-page-subtitle">Operational overview of platform health and activity.</p>

      {loading && <p className="admin-inline-status">Loading telemetry...</p>}
      {error && <p className="admin-inline-error">{error}</p>}

      <div className="admin-card-grid three-col">
        <article className="admin-card metric">
          <h3>Active Users</h3>
          <p className="metric-value">{data?.activeUsers ?? '--'}</p>
          <small>Live WebSocket connections</small>
        </article>

        <article className="admin-card metric">
          <h3>Active Rooms</h3>
          <p className="metric-value">{data?.activeRooms ?? '--'}</p>
          <small>Sessions currently active</small>
        </article>

        <article className="admin-card metric">
          <h3>Recent Errors</h3>
          <p className="metric-value">{data?.recentErrors ?? '--'}</p>
          <small>Last 24 hours</small>
        </article>

        <article className="admin-card metric">
          <h3>System Load</h3>
          <p className="metric-value">
            {typeof data?.systemLoadPercent === 'number' ? `${data.systemLoadPercent}%` : '--'}
          </p>
          <small>Approximate process load</small>
        </article>

        <article className="admin-card metric">
          <h3>Message Throughput</h3>
          <p className="metric-value">
            {typeof data?.messageThroughputPerMinute === 'number'
              ? `${data.messageThroughputPerMinute}/min`
              : '--'}
          </p>
          <small>Messages in last minute</small>
        </article>

        <article className="admin-card metric">
          <h3>Storage Usage</h3>
          <p className="metric-value">
            {typeof data?.storageUsagePercent === 'number' ? `${data.storageUsagePercent}%` : '--'}
          </p>
          <small>Heap usage proxy</small>
        </article>

        <article className="admin-card metric">
          <h3>Total Users</h3>
          <p className="metric-value">{data?.totalUsers ?? '--'}</p>
          <small>Persisted user records</small>
        </article>

        <article className="admin-card metric">
          <h3>Suspended Users</h3>
          <p className="metric-value">{data?.suspendedUsers ?? '--'}</p>
          <small>Currently inactive by moderation</small>
        </article>

        <article className="admin-card metric">
          <h3>Moderation Actions</h3>
          <p className="metric-value">{data?.recentModerationActions ?? '--'}</p>
          <small>Last 24 hours</small>
        </article>
      </div>

      <section className="admin-card">
        <h3>Notes</h3>
        <p>
          This page is a design-aligned scaffold. Wire these cards to telemetry endpoints in a later
          stage.
        </p>
      </section>
    </section>
  )
}
