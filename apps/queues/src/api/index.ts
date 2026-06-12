import express from 'express'
import type { QueueRegistry } from '@/queues/index'
import { createJobsRouter } from '@/api/jobs.routes'
import { createEnqueueRouter } from '@/api/enqueue.routes'
import { config } from '@/config'
import { logger } from '@/logger'

/** Starts the admin + enqueue HTTP server. */
export function startAdminApi(queues: QueueRegistry): void {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'vtt-chat-queues' })
  })

  // Admin inspection API (operator-facing, secured by QUEUE_ADMIN_SECRET)
  app.use('/queues', createJobsRouter(queues))

  // Enqueue API (backend-facing, secured by INTERNAL_JOB_SECRET)
  app.use('/queues', createEnqueueRouter(queues))

  app.listen(config.port, '0.0.0.0', () => {
    logger.info('api', `Queue service listening on port ${config.port}`, {
      adminAuthEnabled: Boolean(config.adminSecret),
      internalAuthEnabled: Boolean(config.internalJobSecret),
    })
  })
}
