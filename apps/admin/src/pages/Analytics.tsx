import { Alert, Box, Card, CardContent, Typography } from '@mui/material'
import { TelemetryMetricCard } from '../components/TelemetryMetricCard'
import { MonitoringAreaChart } from '../features/monitoring/MonitoringAreaChart'
import { TopEventsChart } from '../features/monitoring/TopEventsChart'
import { useMonitoringTelemetry } from '../features/monitoring/useMonitoringTelemetry'

export default function Analytics() {
  const { dashboard, status, loading, error } = useMonitoringTelemetry({ refreshMs: 20_000 })

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
            <MonitoringAreaChart
              title="CPU Trend (24h)"
              points={status?.charts.cpuLoad24h || []}
              color="#f59e0b"
              ySuffix="%"
            />
          </CardContent>
        </Card>

        <Card variant="outlined" className="admin-card">
          <CardContent>
            <MonitoringAreaChart
              title="Message Trend (24h)"
              points={status?.charts.messageThroughput24h || []}
              color="#22c55e"
              ySuffix="/min"
            />
          </CardContent>
        </Card>
      </Box>

      <Card variant="outlined" className="admin-card">
        <CardContent>
          <TopEventsChart events={dashboard?.topClientEvents || []} />
        </CardContent>
      </Card>

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
            <Typography variant="body2">
              <strong>Client Events (1h):</strong>{' '}
              {dashboard?.clientTelemetryEventsLastHour ?? '--'}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
