import { useCallback, useEffect, useState } from 'react'
import { getJson, requestJson } from '../../utils/api'

export interface QueueSummary {
  name: string
  counts: {
    active: number
    waiting: number
    failed: number
    completed: number
  }
}

export interface FailedJob {
  id: string
  name: string
  failedReason: string
  attemptsMade: number
  timestamp: number
}

interface QueueListResponse {
  queues?: QueueSummary[]
  // Some queue service responses nest differently
  [key: string]: unknown
}

export function useDashboardJobs(refreshMs = 15_000) {
  const [queues, setQueues] = useState<QueueSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryBusy, setRetryBusy] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getJson<QueueListResponse>('/queues')
      const list = Array.isArray(data) ? data : (data.queues ?? [])
      setQueues(list as QueueSummary[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job queues')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(true), refreshMs)
    return () => window.clearInterval(interval)
  }, [load, refreshMs])

  const retryFailed = useCallback(
    async (queueName: string, jobId: string) => {
      setRetryBusy(`${queueName}:${jobId}`)
      try {
        await requestJson(`/queues/${queueName}/jobs/${jobId}/retry`, { method: 'POST' })
        await load(true)
      } finally {
        setRetryBusy(null)
      }
    },
    [load]
  )

  return { queues, loading, error, retryBusy, reload: load, retryFailed }
}
