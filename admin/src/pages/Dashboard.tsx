import { useEffect, useState } from 'react'
import { TelemetryMetricCard } from '../components/TelemetryMetricCard'
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
        <TelemetryMetricCard
          title="Active Users"
          value={data?.activeUsers ?? '--'}
          subtitle="Live WebSocket connections"
        />
        <TelemetryMetricCard
          title="Active Rooms"
          value={data?.activeRooms ?? '--'}
          subtitle="Sessions currently active"
        />
        <TelemetryMetricCard
          title="Recent Errors"
          value={data?.recentErrors ?? '--'}
          subtitle="Last 24 hours"
        />
        <TelemetryMetricCard
          title="System Load"
          value={typeof data?.systemLoadPercent === 'number' ? `${data.systemLoadPercent}%` : '--'}
          subtitle="Approximate process load"
        />
        <TelemetryMetricCard
          title="Message Throughput"
          value={
            typeof data?.messageThroughputPerMinute === 'number'
              ? `${data.messageThroughputPerMinute}/min`
              : '--'
          }
          subtitle="Messages in last minute"
        />
        <TelemetryMetricCard
          title="Storage Usage"
          value={typeof data?.storageUsagePercent === 'number' ? `${data.storageUsagePercent}%` : '--'}
          subtitle="Heap usage proxy"
        />
        <TelemetryMetricCard
          title="Total Users"
          value={data?.totalUsers ?? '--'}
          subtitle="Persisted user records"
        />
        <TelemetryMetricCard
          title="Suspended Users"
          value={data?.suspendedUsers ?? '--'}
          subtitle="Currently inactive by moderation"
        />
        <TelemetryMetricCard
          title="Moderation Actions"
          value={data?.recentModerationActions ?? '--'}
          subtitle="Last 24 hours"
        />
      </div>

      <section className="admin-card">
        <h3>Data Provenance</h3>
        <p>
          Metrics on this page are sourced from the authenticated <strong>/telemetry/dashboard</strong>{' '}
          endpoint and refresh automatically every 15 seconds.
        </p>
      </section>
    </section>
  )
}
