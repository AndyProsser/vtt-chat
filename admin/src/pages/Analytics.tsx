import { useEffect, useState } from 'react'
import { SparklineChart } from '../components/SparklineChart'
import { TelemetryMetricCard } from '../components/TelemetryMetricCard'
import { getJson } from '../utils/api'

interface DashboardTelemetry {
  activeUsers: number
  activeRooms: number
  recentErrors: number
  messageThroughputPerMinute: number
  activeCampaigns: number
}

interface StatusTelemetry {
  charts: {
    cpuLoad24h: Array<{ x: number; y: number }>
    messageThroughput24h: Array<{ x: number; y: number }>
  }
}

export default function Analytics() {
  const [dashboard, setDashboard] = useState<DashboardTelemetry | null>(null)
  const [status, setStatus] = useState<StatusTelemetry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [dashboardResult, statusResult] = await Promise.all([
          getJson<DashboardTelemetry>('/telemetry/dashboard', controller.signal),
          getJson<StatusTelemetry>('/telemetry/status', controller.signal),
        ])

        setDashboard(dashboardResult)
        setStatus(statusResult)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics data')
      } finally {
        setLoading(false)
      }
    }

    void load()
    const interval = setInterval(() => void load(), 20_000)

    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [])

  return (
    <section className="admin-page">
      <h2 className="admin-page-title">Analytics</h2>
      <p className="admin-page-subtitle">
        Session engagement and platform activity signals from live telemetry streams.
      </p>

      {loading && <p className="admin-inline-status">Loading analytics...</p>}
      {error && <p className="admin-inline-error">{error}</p>}

      <div className="admin-card-grid three-col">
        <TelemetryMetricCard
          title="Active Campaigns"
          value={dashboard?.activeCampaigns ?? '--'}
          subtitle="Campaigns currently running sessions"
        />
        <TelemetryMetricCard
          title="Active Users"
          value={dashboard?.activeUsers ?? '--'}
          subtitle="Concurrent participant connections"
        />
        <TelemetryMetricCard
          title="Message Throughput"
          value={
            typeof dashboard?.messageThroughputPerMinute === 'number'
              ? `${dashboard.messageThroughputPerMinute}/min`
              : '--'
          }
          subtitle="Rolling one-minute rate"
        />
      </div>

      <div className="admin-card-grid two-col">
        <article className="admin-card">
          <h3>CPU Trend (24h)</h3>
          <SparklineChart
            points={status?.charts.cpuLoad24h || []}
            colorClassName="sparkline-chart-line-cpu"
            valueSuffix="%"
          />
        </article>

        <article className="admin-card">
          <h3>Message Trend (24h)</h3>
          <SparklineChart
            points={status?.charts.messageThroughput24h || []}
            colorClassName="sparkline-chart-line-throughput"
            valueSuffix="/min"
          />
        </article>
      </div>

      <section className="admin-card">
        <h3>Quality Signals</h3>
        <div className="kv-grid">
          <div>
            <strong>Active Rooms:</strong> {dashboard?.activeRooms ?? '--'}
          </div>
          <div>
            <strong>Recent Errors (24h):</strong> {dashboard?.recentErrors ?? '--'}
          </div>
        </div>
      </section>
    </section>
  )
}
