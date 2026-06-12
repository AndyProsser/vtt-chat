import { Worker, type Job } from 'bullmq'
import type IORedis from 'ioredis'
import type { Queue } from 'bullmq'
import { QUEUE_NAMES, JOB_TYPES } from '@shared/jobs/index'
import type { CleanupOldSessionsPayload, DlqEntryPayload } from '@shared/jobs/index'
import { config } from '@/config'
import { logger } from '@/logger'

/**
 * Handles session lifecycle jobs.
 *
 * Calls POST /api/internal/jobs/trigger/lifecycle-sweep on the backend, which runs
 * SessionCleanupJobService.runLifecycleWorkerOnce() (COOLDOWN→ENDED, ENDED→CLEANUP).
 * The backend owns DB writes and WS broadcasting; this worker owns scheduling + retry.
 */
export function startSessionLifecycleWorker(connection: IORedis, dlq: Queue): Worker {
  const worker = new Worker(
    QUEUE_NAMES.SESSION_LIFECYCLE,
    async (job: Job) => {
      if (job.name !== JOB_TYPES.CLEANUP_OLD_SESSIONS) {
        logger.warn('session-lifecycle-worker', 'Unknown job type — discarding', {
          jobName: job.name,
          jobId: job.id,
        })
        return
      }

      const payload = job.data as CleanupOldSessionsPayload
      logger.info('session-lifecycle-worker', 'Triggering lifecycle sweep on backend', {
        jobId: job.id,
        triggeredBy: payload.triggeredBy,
      })

      const url = `${config.backendInternalUrl}/api/internal/jobs/trigger/lifecycle-sweep`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (config.internalJobSecret) {
        headers['Authorization'] = `Bearer ${config.internalJobSecret}`
      }

      const res = await fetch(url, { method: 'POST', headers })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Backend lifecycle sweep failed: HTTP ${res.status} — ${body}`)
      }

      logger.info('session-lifecycle-worker', 'Lifecycle sweep completed', { jobId: job.id })
    },
    {
      connection,
      concurrency: 1, // lifecycle transitions must be serialised
    }
  )

  worker.on('completed', (job) => {
    logger.info('session-lifecycle-worker', 'Job completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    const exhausted = (job?.attemptsMade ?? 0) >= config.retry.maxAttempts
    logger.warn('session-lifecycle-worker', exhausted ? 'Job moved to DLQ' : 'Job failed — will retry', {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })

    if (exhausted && job) {
      const dlqPayload: DlqEntryPayload = {
        originalQueue: QUEUE_NAMES.SESSION_LIFECYCLE,
        originalJobId: job.id ?? '',
        originalJobType: job.name,
        originalPayload: job.data,
        failureReason: err.message,
        attemptsMade: job.attemptsMade,
        failedAt: Date.now(),
      }
      void dlq.add(JOB_TYPES.DLQ_ENTRY, dlqPayload)
    }
  })

  return worker
}
