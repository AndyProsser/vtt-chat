import type { Queue } from 'bullmq'
import { JOB_TYPES } from '@shared/jobs/index'
import type { CleanupOldSessionsPayload } from '@shared/jobs/index'
import { config } from '@/config'
import { logger } from '@/logger'

/**
 * Registers repeatable BullMQ jobs for all scheduled work.
 * Repeatable jobs survive a queues service restart — BullMQ stores the schedule in Redis.
 */
export async function registerScheduledJobs(sessionLifecycleQueue: Queue): Promise<void> {
  const cleanupPayload: CleanupOldSessionsPayload = { triggeredBy: 'scheduler' }

  await sessionLifecycleQueue.upsertJobScheduler(
    'scheduled:cleanup-old-sessions',
    { pattern: config.scheduler.cleanupCronExpression },
    {
      name: JOB_TYPES.CLEANUP_OLD_SESSIONS,
      data: cleanupPayload,
      opts: {
        // Scheduler jobs skip the global retry count — each individual run gets its own attempts.
        attempts: config.retry.maxAttempts,
        backoff: { type: 'exponential', delay: config.retry.baseDelayMs },
      },
    }
  )

  logger.info('scheduler', 'Registered repeatable job: cleanup-old-sessions', {
    cron: config.scheduler.cleanupCronExpression,
  })
}
