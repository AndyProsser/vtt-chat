import { useEffect, useState } from 'react'
import { Alert, Box, Card, CardContent, Typography } from '@mui/material'
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
    <Box component="section" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h5">Analytics</Typography>
      <Typography variant="body2" color="text.secondary">
        Session engagement and platform activity signals from live telemetry streams.
      </Typography>

      {loading && <Alert severity="info">Loading analytics...</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Box className="admin-card-grid three-col">
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
      </Box>

      <Box className="admin-card-grid two-col">
        <Card variant="outlined" className="admin-card">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              CPU Trend (24h)
            </Typography>
            <SparklineChart
              points={status?.charts.cpuLoad24h || []}
              colorClassName="sparkline-chart-line-cpu"
              valueSuffix="%"
            />
          </CardContent>
        </Card>

        <Card variant="outlined" className="admin-card">
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Message Trend (24h)
            </Typography>
            <SparklineChart
              points={status?.charts.messageThroughput24h || []}
              colorClassName="sparkline-chart-line-throughput"
              valueSuffix="/min"
            />
          </CardContent>
        </Card>
      </Box>

      <Card variant="outlined" className="admin-card">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Quality Signals
          </Typography>
          <Box className="kv-grid">
            <Typography variant="body2">
              <strong>Active Rooms:</strong> {dashboard?.activeRooms ?? '--'}
            </Typography>
            <Typography variant="body2">
              <strong>Recent Errors (24h):</strong> {dashboard?.recentErrors ?? '--'}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
