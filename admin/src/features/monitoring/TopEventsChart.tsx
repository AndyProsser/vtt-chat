import { Box, Typography, useTheme } from '@mui/material'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DashboardTelemetry } from './types'

interface TopEventsChartProps {
  events: DashboardTelemetry['topClientEvents']
}

export function TopEventsChart({ events }: TopEventsChartProps) {
  const theme = useTheme()

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="subtitle1">Top Client Telemetry Events (1h)</Typography>
      <Box sx={{ width: '100%', height: 260 }}>
        {events.length ? (
          <ResponsiveContainer>
            <BarChart data={events} margin={{ top: 8, right: 12, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
              <XAxis
                dataKey="event"
                angle={-20}
                textAnchor="end"
                height={56}
                tick={{ fill: theme.palette.text.secondary, fontSize: 11 }}
              />
              <YAxis tick={{ fill: theme.palette.text.secondary, fontSize: 11 }} width={36} />
              <Tooltip />
              <Bar dataKey="count" fill={theme.palette.primary.main} radius={[4, 4, 0, 0]} />
            </BarChart>
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
              No client events in the selected interval
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
