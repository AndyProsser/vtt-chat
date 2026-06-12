/**
 * VTT-Chat Queues Service — entry point.
 *
 * Starts BullMQ workers, registers repeatable scheduled jobs, and exposes
 * an admin HTTP API for queue inspection and operator tooling.
 *
 * Architecture: docs/architecture/QUEUE-JOB-MANAGER.md
 */
import { createRedisConnection, createQueues } from '@/queues/index'
import { startAllWorkers, stopAllWorkers } from '@/workers/index'
import { registerScheduledJobs } from '@/scheduler/index'
import { startAdminApi } from '@/api/index'
import { logger } from '@/logger'

async function main(): Promise<void> {
  logger.info('app', 'Starting vtt-chat-queues service')

  const connection = createRedisConnection()
  const queues = createQueues(connection)

  const workers = startAllWorkers(connection, queues.dlq)

  await registerScheduledJobs(queues.sessionLifecycle)

  startAdminApi(queues)

  logger.info('app', 'vtt-chat-queues service ready')

  // Graceful shutdown
  async function shutdown(signal: string): Promise<void> {
    logger.info('app', `Received ${signal} — shutting down gracefully`)
    await stopAllWorkers(workers)
    await Promise.all(Object.values(queues).map((q) => q.close()))
    connection.disconnect()
    logger.info('app', 'Shutdown complete')
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('Fatal error during startup', err)
  process.exit(1)
})
