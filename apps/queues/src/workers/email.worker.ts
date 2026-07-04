import { Worker, type Job, type Queue } from 'bullmq'
import type IORedis from 'ioredis'
import { QUEUE_NAMES, JOB_TYPES } from '@shared/jobs/index'
import type { SendEmailPayload, DlqEntryPayload } from '@shared/jobs/index'
import { sendEmail } from '@/email/sender'
import { config } from '@/config'
import { logger } from '@/logger'

/**
 * Handles outbound email delivery jobs.
 * Sends email directly via SMTP using the queues service's own SMTP config.
 */
export function startEmailWorker(connection: IORedis, dlq: Queue): Worker {
  const worker = new Worker(
    QUEUE_NAMES.EMAIL,
    async (job: Job) => {
      if (job.name !== JOB_TYPES.SEND_EMAIL) {
        logger.warn('email-worker', 'Unknown job type — discarding', {
          jobName: job.name,
          jobId: job.id,
        })
        return
      }

      const payload = job.data as SendEmailPayload
      logger.info('email-worker', 'Processing send-email job', {
        jobId: job.id,
        to: payload.to,
        templateId: payload.templateId,
        correlationId: payload.correlationId,
      })

      await sendEmail(payload)
    },
    { connection, concurrency: 5 }
  )

  worker.on('completed', (job) => {
    logger.info('email-worker', 'Job completed', { jobId: job.id })
  })

  worker.on('failed', (job, err) => {
    const exhausted = (job?.attemptsMade ?? 0) >= config.retry.maxAttempts
    logger.warn('email-worker', exhausted ? 'Job moved to DLQ' : 'Job failed — will retry', {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    })

    if (exhausted && job) {
      const dlqPayload: DlqEntryPayload = {
        originalQueue: QUEUE_NAMES.EMAIL,
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
