import { Alert, Box, Card, CardContent, Typography } from '@mui/material'
import { TelemetryMetricCard } from '../components/TelemetryMetricCard'
import { MonitoringAreaChart } from '../features/monitoring/MonitoringAreaChart'
import { useMonitoringTelemetry } from '../features/monitoring/useMonitoringTelemetry'

function statusLabelFromPercent(value: number): string {
  if (value >= 85) return 'Critical'
  if (value >= 70) return 'Degraded'
  return 'Healthy'
}

export default function PlatformStatus() {
  const { status, loading, error } = useMonitoringTelemetry({ refreshMs: 20_000 })

  return (
    <Box component="section" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h5">System Health</Typography>
      <Typography variant="body2" color="text.secondary">
        Runtime metrics and dependency status.
      </Typography>

      {loading && <Alert severity="info">Loading status telemetry...</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Box className="admin-card-grid three-col">
        <TelemetryMetricCard
          title="CPU"
          value={
            typeof status?.cards.cpuPercent === 'number' ? `${status.cards.cpuPercent}%` : '--'
          }
          subtitle={`Status: ${
            typeof status?.cards.cpuPercent === 'number'
              ? statusLabelFromPercent(status.cards.cpuPercent)
              : '--'
          }`}
        />
        <TelemetryMetricCard
          title="Memory"
          value={
            typeof status?.cards.memoryPercent === 'number'
              ? `${status.cards.memoryPercent}%`
              : '--'
          }
          subtitle={`Status: ${
            typeof status?.cards.memoryPercent === 'number'
              ? statusLabelFromPercent(status.cards.memoryPercent)
              : '--'
          }`}
        />
        <TelemetryMetricCard
          title="Disk"
          value={
            typeof status?.cards.diskPercent === 'number' ? `${status.cards.diskPercent}%` : '--'
          }
          subtitle={`Status: ${
            typeof status?.cards.diskPercent === 'number'
              ? statusLabelFromPercent(status.cards.diskPercent)
              : '--'
          }`}
        />
        <TelemetryMetricCard
          title="Network"
          value={
            typeof status?.cards.networkLatencyMs === 'number'
              ? `${status.cards.networkLatencyMs}ms`
              : '--'
          }
          subtitle="Status: Healthy"
        />
        <TelemetryMetricCard
          title="LiveKit"
          value={status?.cards.livekitStatus ?? '--'}
          subtitle="Status: Healthy"
        />
        <TelemetryMetricCard
          title="Database"
          value={status?.cards.databaseStatus ?? '--'}
          subtitle="Status: Healthy"
        />
      </Box>

      <Box className="admin-card-grid two-col">
        <Card variant="outlined" className="admin-card">
          <CardContent>
            <MonitoringAreaChart
              title="CPU Load (24h)"
              points={status?.charts.cpuLoad24h || []}
              color="#f59e0b"
              ySuffix="%"
            />
          </CardContent>
        </Card>
        <Card variant="outlined" className="admin-card">
          <CardContent>
            <MonitoringAreaChart
              title="Message Throughput (24h)"
              points={status?.charts.messageThroughput24h || []}
              color="#22c55e"
              ySuffix="/min"
            />
          </CardContent>
        </Card>
      </Box>

      <Card variant="outlined" className="admin-card">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Process Uptime
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {typeof status?.uptimeSec === 'number'
              ? `${Math.floor(status.uptimeSec / 60)} minutes`
              : '--'}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
