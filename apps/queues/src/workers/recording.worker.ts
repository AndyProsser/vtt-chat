import { Worker, type Job, type Queue } from 'bullmq'
import type IORedis from 'ioredis'
import { QUEUE_NAMES, JOB_TYPES } from '@shared/jobs/index'
import type { ProcessRecordingPayload, DlqEntryPayload } from '@shared/jobs/index'
import { config } from '@/config'
import { logger } from '@/logger'

/**
 * Handles post-session recording processing jobs.
 *
 * When RECORDING_PROCESSOR_URL is set, POSTs the job payload to that endpoint.
 * When unset, the job succeeds silently — safe to enqueue ahead of the recording
 * processor service being deployed.
 */
export function startRecordingWorker(connection: IORedis, dlq: Queue): Worker {
  const worker = new Worker(
    QUEUE_NAMES.RECORDING,
    async (job: Job) => {
      if (job.name !== JOB_TYPES.PROCESS_RECORDING) {
        logger.warn('recording-worker', 'Unknown job type — discarding', { jobName: job.name, jobId: job.id })
        return
      }

      const payload = job.data as ProcessRecordingPayload
      const processorUrl = config.integrations.recordingProcessorUrl

      if (!processorUrl) {
        logger.info('recording-worker', 'RECORDING_PROCESSOR_URL not configured — job skipped (will activate on deploy)', {
          jobId: job.id,
          sessionId: payload.sessionId,
          recordingId: payload.recordingId,
        })
        return
      }

      logger.info('recording-worker', 'Sending recording job to processor', {
        jobId: job.id,
        sessionId: payload.sessionId,
        recordingId: payload.recordingId,
        processorUrl,
      })

      const res = await fetch(processorUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Recording processor returned HTTP ${res.status}: ${body}`)
      }

      logger.info('recording-worker', 'Recording job accepted by processor', { jobId: job.id })
    },
    { connection, concurrency: 2 }
  )

  worker.on('completed', (job) => {
    logger.info('recording-worker', 'Job completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    const exhausted = (job?.attemptsMade ?? 0) >= config.retry.maxAttempts
    logger.warn('recording-worker', exhausted ? 'Job moved to DLQ' : 'Job failed — will retry', {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })

    if (exhausted && job) {
      const dlqPayload: DlqEntryPayload = {
        originalQueue: QUEUE_NAMES.RECORDING,
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
