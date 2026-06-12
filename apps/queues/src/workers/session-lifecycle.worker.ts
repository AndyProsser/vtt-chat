import { Worker, type Job } from 'bullmq'
import type IORedis from 'ioredis'
import { QUEUE_NAMES, JOB_TYPES } from '@shared/jobs/index'
import type { CleanupOldSessionsPayload, DlqEntryPayload } from '@shared/jobs/index'
import { logger } from '@/logger'
import type { Queue } from 'bullmq'
import { config } from '@/config'

/**
 * Handles session lifecycle jobs — currently `cleanup-old-sessions`.
 *
 * Phase 1: Logs the job and returns. The backend's in-process SessionCleanupJobService
 * still performs the actual transitions. Phase 2 migrates that logic here so the
 * queues service owns the full lifecycle sweep end-to-end.
 *
 * @see docs/architecture/QUEUE-JOB-MANAGER.md §8
 */
export function startSessionLifecycleWorker(connection: IORedis, dlq: Queue): Worker {
  const worker = new Worker(
    QUEUE_NAMES.SESSION_LIFECYCLE,
    async (job: Job) => {
      switch (job.name) {
        case JOB_TYPES.CLEANUP_OLD_SESSIONS: {
          const payload = job.data as CleanupOldSessionsPayload
          logger.info('session-lifecycle-worker', 'Processing cleanup-old-sessions job', {
            jobId: job.id,
            triggeredBy: payload.triggeredBy,
            maxAgeMs: payload.maxAgeMs,
          })

          // TODO(phase-2): Replace this stub with the migrated session lifecycle sweep logic
          // from apps/backend/src/services/session/cleanup-job.service.ts. The worker will
          // call backend internal HTTP endpoints or share a DB connection (TBD in Phase 2).
          logger.info('session-lifecycle-worker', 'cleanup-old-sessions job completed (stub)', {
            jobId: job.id,
          })
          break
        }

        default:
          logger.warn('session-lifecycle-worker', 'Unknown job type received — discarding', {
            jobName: job.name,
            jobId: job.id,
          })
      }
    },
    {
      connection,
      concurrency: 1, // lifecycle transitions must be serialised
    }
  )

  worker.on('completed', (job) => {
    logger.info('session-lifecycle-worker', 'Job completed', { jobId: job.id, jobName: job.name })
  })

  worker.on('failed', (job, err) => {
    const exhausted = (job?.attemptsMade ?? 0) >= config.retry.maxAttempts
    logger.warn('session-lifecycle-worker', exhausted ? 'Job moved to DLQ' : 'Job failed — will retry', {
      jobId: job?.id,
      jobName: job?.name,
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
