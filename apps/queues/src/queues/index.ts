import { Queue } from 'bullmq'
import IORedis from 'ioredis'
import { QUEUE_NAMES } from '@shared/jobs/index'
import { config } from '@/config'
import { defaultJobOptions } from '@/queues/options'

/** Shared ioredis connection for all BullMQ queues and workers. */
export function createRedisConnection(): IORedis {
  return new IORedis(config.redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  })
}

export interface QueueRegistry {
  sessionLifecycle: Queue
  cleanup: Queue
  email: Queue
  summary: Queue
  dlq: Queue
}

/** Creates all BullMQ Queue instances. Call once at startup. */
export function createQueues(connection: IORedis): QueueRegistry {
  const opts = { connection, defaultJobOptions: defaultJobOptions() }

  return {
    sessionLifecycle: new Queue(QUEUE_NAMES.SESSION_LIFECYCLE, opts),
    cleanup: new Queue(QUEUE_NAMES.CLEANUP, opts),
    email: new Queue(QUEUE_NAMES.EMAIL, opts),
    summary: new Queue(QUEUE_NAMES.SUMMARY, opts),
    dlq: new Queue(QUEUE_NAMES.DLQ, { connection }), // DLQ jobs are not retried
  }
}
