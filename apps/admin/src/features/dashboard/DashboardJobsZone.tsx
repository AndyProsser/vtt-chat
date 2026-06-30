import {
  Alert,
  Box,
  Button,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { QueueSummary } from './useDashboardJobs'

interface Props {
  queues: QueueSummary[]
  loading: boolean
  error: string | null
  retryBusy: string | null
  onNavigateToJobs: () => void
}

function statusChip(count: number, label: string, color: 'default' | 'warning' | 'error') {
  if (count === 0) return null
  return <Chip label={`${count} ${label}`} color={color} size="small" sx={{ mr: 0.5 }} />
}

/** Zone C — compact live queue summary; links to full inspector in Settings. */
export function DashboardJobsZone({ queues, loading, error, onNavigateToJobs }: Props) {
  const hasIssues = queues.some((q) => q.counts.failed > 0 || q.counts.active > 0)

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Job Queues
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Live status · auto-refreshes every 15 s
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={onNavigateToJobs}>
          Full Inspector
        </Button>
      </Box>

      {error && <Alert severity="warning">Queue service unreachable — {error}</Alert>}

      {loading && !queues.length ? (
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
      ) : queues.length === 0 && !error ? (
        <Box
          sx={{
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            p: 3,
            textAlign: 'center',
          }}
        >
          <Typography color="text.secondary" variant="body2">
            All queues clear — <em>the roads are safe</em>
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            bgcolor: 'background.paper',
            border: 1,
            borderColor: hasIssues ? 'warning.main' : 'divider',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Queue</TableCell>
                <TableCell align="right">Active</TableCell>
                <TableCell align="right">Waiting</TableCell>
                <TableCell align="right">Failed (24h)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {queues.map((q) => (
                <TableRow key={q.name} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {q.name}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {statusChip(q.counts.active, 'active', 'default') ?? (
                      <Typography variant="body2" color="text.secondary">
                        0
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="text.secondary">
                      {q.counts.waiting}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {q.counts.failed > 0 ? (
                      statusChip(q.counts.failed, 'failed', 'error')
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        0
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}
