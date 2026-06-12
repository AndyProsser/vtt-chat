import type { DefaultJobOptions } from 'bullmq'
import { config } from '@/config'

/** Default job options shared by all queues. Overridable per-queue. */
export function defaultJobOptions(): DefaultJobOptions {
  return {
    attempts: config.retry.maxAttempts,
    backoff: {
      type: 'exponential',
      delay: config.retry.baseDelayMs,
    },
    removeOnComplete: { count: 500, age: 60 * 60 * 24 * 7 }, // keep 500 or 7 days
    removeOnFail: false, // retain failed jobs so DLQ handler can inspect them
  }
}
