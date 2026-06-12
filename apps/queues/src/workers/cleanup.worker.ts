import { Worker, type Job, type Queue } from 'bullmq'
import type IORedis from 'ioredis'
import { QUEUE_NAMES, JOB_TYPES } from '@shared/jobs/index'
import type { DlqEntryPayload } from '@shared/jobs/index'
import { logger } from '@/logger'
import { config } from '@/config'

/**
 * Handles general cleanup jobs (archive verification, old-data purge, etc.).
 * Phase 1: stub — logs and succeeds. Phase 2 migrates archiveWorker logic here.
 */
export function startCleanupWorker(connection: IORedis, dlq: Queue): Worker {
  const worker = new Worker(
    QUEUE_NAMES.CLEANUP,
    async (job: Job) => {
      logger.info('cleanup-worker', 'Processing cleanup job', {
        jobId: job.id,
        jobName: job.name,
      })

      // TODO(phase-2): Migrate apps/backend/src/services/session/cleanup-job.service.ts
      // phaseCleanupArchiveLock() logic here.
      logger.info('cleanup-worker', 'Cleanup job completed (stub)', { jobId: job.id })
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
      jobName: job?.name,
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
