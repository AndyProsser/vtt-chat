import { Worker, type Job, type Queue } from 'bullmq'
import type IORedis from 'ioredis'
import { QUEUE_NAMES, JOB_TYPES } from '@shared/jobs/index'
import type { DlqEntryPayload } from '@shared/jobs/index'
import { config } from '@/config'
import { logger } from '@/logger'

/**
 * Handles archive verification jobs.
 *
 * Calls POST /api/internal/jobs/trigger/archive-verify on the backend, which runs
 * SessionCleanupJobService.runArchiveWorkerOnce() (CLEANUP age check + greenroom purge).
 */
export function startCleanupWorker(connection: IORedis, dlq: Queue): Worker {
  const worker = new Worker(
    QUEUE_NAMES.CLEANUP,
    async (job: Job) => {
      logger.info('cleanup-worker', 'Triggering archive verify on backend', {
        jobId: job.id,
        jobName: job.name,
      })

      const url = `${config.backendInternalUrl}/api/internal/jobs/trigger/archive-verify`
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (config.internalJobSecret) {
        headers['Authorization'] = `Bearer ${config.internalJobSecret}`
      }

      const res = await fetch(url, { method: 'POST', headers })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Backend archive verify failed: HTTP ${res.status} — ${body}`)
      }

      logger.info('cleanup-worker', 'Archive verify completed', { jobId: job.id })
    },
    { connection, concurrency: 2 }
  )

  worker.on('completed', (job) => {
    logger.info('cleanup-worker', 'Job completed', { jobId: job.id, jobName: job.name })
  })

  worker.on('failed', (job, err) => {
    const exhausted = (job?.attemptsMade ?? 0) >= config.retry.maxAttempts
    logger.warn('cleanup-worker', exhausted ? 'Job moved to DLQ' : 'Job failed — will retry', {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })

    if (exhausted && job) {
      const dlqPayload: DlqEntryPayload = {
        originalQueue: QUEUE_NAMES.CLEANUP,
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
