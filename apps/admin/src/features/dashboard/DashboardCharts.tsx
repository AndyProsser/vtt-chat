import { Box, Card, CardContent, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { MonitoringAreaChart } from '../monitoring/MonitoringAreaChart'
import type { StatusTelemetry } from '@/types/monitoring'

type TimeRange = '1h' | '24h' | '7d'

interface Props {
  status: StatusTelemetry | null
  timeRange: TimeRange
  onTimeRangeChange: (range: TimeRange) => void
}

/**
 * Zone B — four activity charts with a shared time-range selector.
 * Backend currently provides 24h chart data; the selector is wired up for
 * future multi-range endpoint support.
 */
export function DashboardCharts({ status, timeRange, onTimeRangeChange }: Props) {
  const cpuPoints = status?.charts.cpuLoad24h ?? []
  const msgPoints = status?.charts.messageThroughput24h ?? []

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Activity
        </Typography>
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          size="small"
          onChange={(_e, v: TimeRange | null) => {
            if (v) onTimeRangeChange(v)
          }}
        >
          <ToggleButton value="1h">1h</ToggleButton>
          <ToggleButton value="24h">24h</ToggleButton>
          <ToggleButton value="7d">7d</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box className="admin-card-grid two-col">
        <Card variant="outlined">
          <CardContent>
            <MonitoringAreaChart
              title="Message Throughput"
              points={msgPoints}
              color="#22c55e"
              ySuffix="/min"
            />
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <MonitoringAreaChart title="CPU Load" points={cpuPoints} color="#f59e0b" ySuffix="%" />
          </CardContent>
        </Card>
      </Box>

      <Box className="admin-card-grid three-col">
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Memory
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {typeof status?.cards.memoryPercent === 'number'
              ? `${status.cards.memoryPercent}%`
              : '—'}
          </Typography>
        </Card>
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Disk
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {typeof status?.cards.diskPercent === 'number' ? `${status.cards.diskPercent}%` : '—'}
          </Typography>
        </Card>
        <Card variant="outlined" sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Uptime
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {typeof status?.uptimeSec === 'number' ? `${Math.floor(status.uptimeSec / 60)}m` : '—'}
          </Typography>
        </Card>
      </Box>
    </Box>
  )
}
