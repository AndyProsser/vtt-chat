import { Box, Typography, useTheme } from '@mui/material'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TimelinePoint } from '@/types/monitoring'

interface MonitoringAreaChartProps {
  title: string
  points: TimelinePoint[]
  color: string
  ySuffix?: string
  height?: number
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value?: number }>
  label?: string | number
}

function MetricTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  const value = payload[0]?.value
  return (
    <Box
      sx={{
        px: 1,
        py: 0.75,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        Slice {label}
      </Typography>
      <Typography variant="body2">{typeof value === 'number' ? value : '--'}</Typography>
    </Box>
  )
}

export function MonitoringAreaChart({
  title,
  points,
  color,
  ySuffix = '',
  height = 220,
}: MonitoringAreaChartProps) {
  const theme = useTheme()

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="subtitle1">{title}</Typography>
      <Box sx={{ width: '100%', height }}>
        {points.length ? (
          <ResponsiveContainer>
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`area-${title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis dataKey="x" tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} />
              <YAxis
                tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
                tickFormatter={(value) => `${value}${ySuffix}`}
                width={44}
              />
              <Tooltip content={<MetricTooltip />} />
              <Area
                type="monotone"
                dataKey="y"
                stroke={color}
                strokeWidth={2}
                fill={`url(#area-${title})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Box
            sx={{
              height: '100%',
              border: '1px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No chart data
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
