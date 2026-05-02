import { Alert, Box, Card, CardContent, Typography } from '@mui/material'
import { TelemetryMetricCard } from '../components/TelemetryMetricCard'
import { useMonitoringTelemetry } from '../features/monitoring/useMonitoringTelemetry'

export default function Dashboard() {
  const { dashboard, loading, error } = useMonitoringTelemetry({ refreshMs: 15_000 })

  return (
    <Box component="section" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h5">Dashboard</Typography>
      <Typography variant="body2" color="text.secondary">
        Operational overview of platform health and activity.
      </Typography>

      {loading && <Alert severity="info">Loading telemetry...</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Box className="admin-card-grid three-col">
        <TelemetryMetricCard
          title="Active Users"
          value={dashboard?.activeUsers ?? '--'}
          subtitle="Live WebSocket connections"
        />
        <TelemetryMetricCard
          title="Active Rooms"
          value={dashboard?.activeRooms ?? '--'}
          subtitle="Sessions currently active"
        />
        <TelemetryMetricCard
          title="Recent Errors"
          value={dashboard?.recentErrors ?? '--'}
          subtitle="Last 24 hours"
        />
        <TelemetryMetricCard
          title="System Load"
          value={
            typeof dashboard?.systemLoadPercent === 'number'
              ? `${dashboard.systemLoadPercent}%`
              : '--'
          }
          subtitle="Approximate process load"
        />
        <TelemetryMetricCard
          title="Message Throughput"
          value={
            typeof dashboard?.messageThroughputPerMinute === 'number'
              ? `${dashboard.messageThroughputPerMinute}/min`
              : '--'
          }
          subtitle="Messages in last minute"
        />
        <TelemetryMetricCard
          title="Storage Usage"
          value={
            typeof dashboard?.storageUsagePercent === 'number'
              ? `${dashboard.storageUsagePercent}%`
              : '--'
          }
          subtitle="Heap usage proxy"
        />
        <TelemetryMetricCard
          title="Total Users"
          value={dashboard?.totalUsers ?? '--'}
          subtitle="Persisted user records"
        />
        <TelemetryMetricCard
          title="Suspended Users"
          value={dashboard?.suspendedUsers ?? '--'}
          subtitle="Currently inactive by moderation"
        />
        <TelemetryMetricCard
          title="Moderation Actions"
          value={dashboard?.recentModerationActions ?? '--'}
          subtitle="Last 24 hours"
        />
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Data Provenance
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Metrics on this page are sourced from the authenticated{' '}
            <strong>/telemetry/dashboard</strong> endpoint and refresh automatically every 15
            seconds.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
