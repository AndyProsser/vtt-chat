import { useState } from 'react'
import { Alert, Box, Divider, Typography } from '@mui/material'
import { DashboardStatusStrip } from '../features/dashboard/DashboardStatusStrip'
import { DashboardCharts } from '../features/dashboard/DashboardCharts'
import { DashboardJobsZone } from '../features/dashboard/DashboardJobsZone'
import { useMonitoringTelemetry } from '../features/monitoring/useMonitoringTelemetry'
import { useDashboardJobs } from '../features/dashboard/useDashboardJobs'

interface Props {
  onNavigateToJobs: () => void
}

export default function Dashboard({ onNavigateToJobs }: Props) {
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h')

  const { dashboard, status, loading, error } = useMonitoringTelemetry({ refreshMs: 15_000 })
  const jobs = useDashboardJobs(15_000)

  return (
    <Box component="section" sx={{ display: 'grid', gap: 3 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Dashboard
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The Scrying Pool — operational overview, auto-refreshing every 15 s
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {/* Zone A — Status Strip */}
      <DashboardStatusStrip dashboard={dashboard} status={status} loading={loading} />

      <Divider />

      {/* Zone B — Activity Charts */}
      <DashboardCharts status={status} timeRange={timeRange} onTimeRangeChange={setTimeRange} />

      <Divider />

      {/* Zone C — Running Jobs */}
      <DashboardJobsZone
        queues={jobs.queues}
        loading={jobs.loading}
        error={jobs.error}
        retryBusy={jobs.retryBusy}
        onNavigateToJobs={onNavigateToJobs}
      />
    </Box>
  )
}
