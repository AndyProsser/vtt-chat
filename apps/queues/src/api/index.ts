import express from 'express'
import type { QueueRegistry } from '@/queues/index'
import { createJobsRouter } from '@/api/jobs.routes'
import { config } from '@/config'
import { logger } from '@/logger'

/** Starts the admin HTTP server for queue inspection/management. */
export function startAdminApi(queues: QueueRegistry): void {
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'vtt-chat-queues' })
  })

  app.use('/queues', createJobsRouter(queues))

  app.listen(config.port, '0.0.0.0', () => {
    logger.info('api', `Admin API listening on port ${config.port}`, {
      authEnabled: Boolean(config.adminSecret),
    })
  })
}
