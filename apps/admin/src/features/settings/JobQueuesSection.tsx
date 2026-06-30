import { useCallback, useEffect, useState } from 'react'
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
import { getJson, requestJson } from '../../utils/api'
import type { QueueSummary } from '../dashboard/useDashboardJobs'

interface FailedJob {
  id: string
  name: string
  failedReason: string
  attemptsMade: number
  timestamp: number
}

interface FailedJobsResponse {
  jobs?: FailedJob[]
  [key: string]: unknown
}

function useQueueInspector() {
  const [queues, setQueues] = useState<QueueSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedQueue, setExpandedQueue] = useState<string | null>(null)
  const [failedJobs, setFailedJobs] = useState<Record<string, FailedJob[]>>({})
  const [jobsLoading, setJobsLoading] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)

  const loadQueues = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await getJson<{ queues?: QueueSummary[] } | QueueSummary[]>('/queues')
      const list = Array.isArray(data) ? data : (data.queues ?? [])
      setQueues(list as QueueSummary[])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Queue service unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadQueues() }, [loadQueues])

  const toggleExpand = async (name: string) => {
    if (expandedQueue === name) {
      setExpandedQueue(null)
      return
    }
    setExpandedQueue(name)
    if (failedJobs[name]) return
    setJobsLoading(name)
    try {
      const data = await getJson<FailedJobsResponse>(
        `/queues/${name}/jobs?state=failed&start=0&end=24`
      )
      const jobs = Array.isArray(data) ? data : (data.jobs ?? [])
      setFailedJobs((prev) => ({ ...prev, [name]: jobs as FailedJob[] }))
    } finally {
      setJobsLoading(null)
    }
  }

  const retryJob = async (queue: string, jobId: string) => {
    const key = `${queue}:${jobId}`
    setActionBusy(key)
    try {
      await requestJson(`/queues/${queue}/jobs/${jobId}/retry`, { method: 'POST' })
      setFailedJobs((prev) => ({
        ...prev,
        [queue]: (prev[queue] ?? []).filter((j) => j.id !== jobId),
      }))
      await loadQueues(true)
    } finally {
      setActionBusy(null)
    }
  }

  const deleteJob = async (queue: string, jobId: string) => {
    const key = `${queue}:${jobId}:del`
    setActionBusy(key)
    try {
      await requestJson(`/queues/${queue}/jobs/${jobId}`, { method: 'DELETE' })
      setFailedJobs((prev) => ({
        ...prev,
        [queue]: (prev[queue] ?? []).filter((j) => j.id !== jobId),
      }))
      await loadQueues(true)
    } finally {
      setActionBusy(null)
    }
  }

  return {
    queues, loading, error, expandedQueue, failedJobs, jobsLoading, actionBusy,
    loadQueues, toggleExpand, retryJob, deleteJob,
  }
}

/** Full job queue inspector with per-queue expand and per-job retry/delete. */
export function JobQueuesSection() {
  const {
    queues, loading, error, expandedQueue, failedJobs, jobsLoading, actionBusy,
    loadQueues, toggleExpand, retryJob, deleteJob,
  } = useQueueInspector()

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Job Queues</Typography>
        <Button size="small" variant="outlined" onClick={() => void loadQueues()}>
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="warning">{error}</Alert>}

      {loading ? (
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
      ) : queues.length === 0 ? (
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
            No queues registered — <em>the forge is cold</em>
          </Typography>
        </Box>
      ) : (
        queues.map((q) => (
          <Box
            key={q.name}
            sx={{
              border: 1,
              borderColor: q.counts.failed > 0 ? 'error.main' : 'divider',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1.5,
                bgcolor: 'background.paper',
                cursor: 'pointer',
              }}
              onClick={() => void toggleExpand(q.name)}
            >
              <Typography variant="body1" fontWeight={600} sx={{ flex: 1 }}>
                {q.name}
              </Typography>
              {q.counts.active > 0 && (
                <Chip label={`${q.counts.active} active`} color="default" size="small" />
              )}
              {q.counts.waiting > 0 && (
                <Chip label={`${q.counts.waiting} waiting`} color="default" size="small" />
              )}
              {q.counts.failed > 0 && (
                <Chip label={`${q.counts.failed} failed`} color="error" size="small" />
              )}
              <Typography variant="caption" color="text.secondary">
                {expandedQueue === q.name ? '▲' : '▼'}
              </Typography>
            </Box>

            {expandedQueue === q.name && (
              <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
                {jobsLoading === q.name ? (
                  <Box sx={{ p: 2 }}>
                    <Skeleton height={60} />
                  </Box>
                ) : (failedJobs[q.name] ?? []).length === 0 ? (
                  <Box sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      No failed jobs in this queue.
                    </Typography>
                  </Box>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Job</TableCell>
                        <TableCell>Error</TableCell>
                        <TableCell align="right">Attempts</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(failedJobs[q.name] ?? []).map((job) => (
                        <TableRow key={job.id}>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>
                              {job.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              #{job.id}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="error.main" sx={{ wordBreak: 'break-word' }}>
                              {job.failedReason}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">{job.attemptsMade}</TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <Button
                                size="small"
                                disabled={actionBusy === `${q.name}:${job.id}`}
                                onClick={() => void retryJob(q.name, job.id)}
                              >
                                Retry
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                disabled={actionBusy === `${q.name}:${job.id}:del`}
                                onClick={() => void deleteJob(q.name, job.id)}
                              >
                                Delete
                              </Button>
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Box>
            )}
          </Box>
        ))
      )}
    </Box>
  )
}
