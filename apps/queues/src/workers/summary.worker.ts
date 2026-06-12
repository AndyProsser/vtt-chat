import { Worker, type Job, type Queue } from 'bullmq'
import type IORedis from 'ioredis'
import { QUEUE_NAMES, JOB_TYPES } from '@shared/jobs/index'
import type { GenerateSummaryPayload, DlqEntryPayload } from '@shared/jobs/index'
import { config } from '@/config'
import { logger } from '@/logger'

/**
 * Handles post-session summary generation.
 *
 * When LLM_SUMMARY_URL is set, POSTs the job payload to that endpoint and waits
 * for confirmation. When unset, the job succeeds silently — safe to enqueue
 * ahead of the LLM service being deployed.
 *
 * Checkpoint resume (§6 of QUEUE-JOB-MANAGER.md) will be added when the LLM
 * integration is implemented; the payload already carries the fields needed.
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
      const llmUrl = config.integrations.llmSummaryUrl

      if (!llmUrl) {
        logger.info('summary-worker', 'LLM_SUMMARY_URL not configured — job skipped (will activate on deploy)', {
          jobId: job.id,
          sessionId: payload.sessionId,
        })
        return
      }

      logger.info('summary-worker', 'Sending summary request to LLM service', {
        jobId: job.id,
        sessionId: payload.sessionId,
        campaignId: payload.campaignId,
        llmUrl,
      })

      const res = await fetch(llmUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`LLM service returned HTTP ${res.status}: ${body}`)
      }

      logger.info('summary-worker', 'Summary request accepted by LLM service', { jobId: job.id })
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
