import { Box, Chip, Skeleton, Tooltip, Typography } from '@mui/material'
import type { DashboardTelemetry, StatusTelemetry } from '@/types/monitoring'

interface Props {
  dashboard: DashboardTelemetry | null
  status: StatusTelemetry | null
  loading: boolean
}

function healthStatus(
  cpu: number | undefined,
  mem: number | undefined
): {
  label: string
  color: 'success' | 'warning' | 'error'
} {
  const max = Math.max(cpu ?? 0, mem ?? 0)
  if (max >= 85) return { label: 'Critical', color: 'error' }
  if (max >= 70) return { label: 'Degraded', color: 'warning' }
  return { label: 'Healthy', color: 'success' }
}

interface KpiCardProps {
  label: string
  value: string | number
  sub: string
  loading: boolean
  tooltip?: string
}

function KpiCard({ label, value, sub, loading, tooltip }: KpiCardProps) {
  const card = (
    <Box
      sx={{
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 2,
        p: 1.75,
        minWidth: 140,
        flex: '1 1 140px',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      {loading ? (
        <Skeleton width={60} height={36} />
      ) : (
        <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.2, mt: 0.5 }}>
          {value}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        {sub}
      </Typography>
    </Box>
  )

  return tooltip ? <Tooltip title={tooltip}>{card}</Tooltip> : card
}

/** Zone A — five live KPI cards that refresh every 15 s. */
export function DashboardStatusStrip({ dashboard, status, loading }: Props) {
  const health = healthStatus(status?.cards.cpuPercent, status?.cards.memoryPercent)

  return (
    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
      <KpiCard
        label="Active Sessions"
        value={dashboard?.activeCampaigns ?? '—'}
        sub="Campaigns in ACTIVE state"
        loading={loading}
      />
      <KpiCard
        label="Connected Users"
        value={dashboard?.activeUsers ?? '—'}
        sub="Live WebSocket connections"
        loading={loading}
      />
      <Box
        sx={{
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          p: 1.75,
          minWidth: 140,
          flex: '1 1 140px',
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          System Status
        </Typography>
        {loading ? (
          <Skeleton width={80} height={36} />
        ) : (
          <Box sx={{ mt: 0.75 }}>
            <Chip label={health.label} color={health.color} size="small" />
          </Box>
        )}
        <Typography variant="caption" color="text.secondary">
          {typeof status?.cards.cpuPercent === 'number'
            ? `CPU ${status.cards.cpuPercent}% · Mem ${status.cards.memoryPercent}%`
            : 'Awaiting metrics'}
        </Typography>
      </Box>
      <KpiCard
        label="Errors (24h)"
        value={dashboard?.recentErrors ?? '—'}
        sub="Application error count"
        loading={loading}
      />
      <KpiCard
        label="Message Rate"
        value={
          typeof dashboard?.messageThroughputPerMinute === 'number'
            ? `${dashboard.messageThroughputPerMinute}/min`
            : '—'
        }
        sub="Rolling 1-minute throughput"
        loading={loading}
      />
    </Box>
  )
}
