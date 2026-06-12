import type IORedis from 'ioredis'
import type { Queue, Worker } from 'bullmq'
import { startSessionLifecycleWorker } from '@/workers/session-lifecycle.worker'
import { startCleanupWorker } from '@/workers/cleanup.worker'
import { startEmailWorker } from '@/workers/email.worker'
import { startSummaryWorker } from '@/workers/summary.worker'
import { startRecordingWorker } from '@/workers/recording.worker'
import { logger } from '@/logger'

export interface WorkerRegistry {
  sessionLifecycle: Worker
  cleanup: Worker
  email: Worker
  summary: Worker
  recording: Worker
}

/** Starts all BullMQ workers. Call once at startup, after queues are created. */
export function startAllWorkers(connection: IORedis, dlq: Queue): WorkerRegistry {
  logger.info('workers', 'Starting all queue workers')

  const registry: WorkerRegistry = {
    sessionLifecycle: startSessionLifecycleWorker(connection, dlq),
    cleanup: startCleanupWorker(connection, dlq),
    email: startEmailWorker(connection, dlq),
    summary: startSummaryWorker(connection, dlq),
    recording: startRecordingWorker(connection, dlq),
  }

  logger.info('workers', 'All workers started', { workers: Object.keys(registry) })

  return registry
}

/** Gracefully closes all workers — drains in-flight jobs before shutting down. */
export async function stopAllWorkers(registry: WorkerRegistry): Promise<void> {
  logger.info('workers', 'Stopping all workers')
  await Promise.all(Object.values(registry).map((w) => w.close()))
  logger.info('workers', 'All workers stopped')
}
