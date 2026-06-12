import { Worker, type Job, type Queue } from 'bullmq'
import type IORedis from 'ioredis'
import { QUEUE_NAMES, JOB_TYPES } from '@shared/jobs/index'
import type { GenerateSummaryPayload, DlqEntryPayload } from '@shared/jobs/index'
import { logger } from '@/logger'
import { config } from '@/config'

/**
 * Handles post-session summary generation.
 * Phase 1: stub — logs the request and succeeds.
 * Phase 2: call an LLM summarisation endpoint and persist the result.
 *
 * Long-running summary jobs will checkpoint progress (§6 of QUEUE-JOB-MANAGER.md)
 * once the real implementation lands.
 */
export function startSummaryWorker(connection: IORedis, dlq: Queue): Worker {
  const worker = new Worker(
    QUEUE_NAMES.SUMMARY,
    async (job: Job) => {
      if (job.name !== JOB_TYPES.GENERATE_SUMMARY) {
        logger.warn('summary-worker', 'Unknown job type — discarding', { jobName: job.name, jobId: job.id })
        return
      }

      const payload = job.data as GenerateSummaryPayload
      logger.info('summary-worker', 'Processing generate-summary job (stub)', {
        jobId: job.id,
        sessionId: payload.sessionId,
        campaignId: payload.campaignId,
        requestedBy: payload.requestedBy,
        includeTranscript: payload.includeTranscript,
      })

      // TODO(phase-2): Integrate LLM summary service. Checkpoint completed stages to
      // Postgres so retries can resume without re-processing.
    },
    { connection, concurrency: 2 }
  )

  worker.on('completed', (job) => {
    logger.info('summary-worker', 'Job completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    const exhausted = (job?.attemptsMade ?? 0) >= config.retry.maxAttempts
    logger.warn('summary-worker', exhausted ? 'Job moved to DLQ' : 'Job failed — will retry', {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })

    if (exhausted && job) {
      const dlqPayload: DlqEntryPayload = {
        originalQueue: QUEUE_NAMES.SUMMARY,
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
