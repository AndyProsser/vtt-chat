/**
 * Enqueue endpoints — called by the backend to push jobs into BullMQ.
 * Protected by the same INTERNAL_JOB_SECRET as the backend's /internal/* routes.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Queue } from 'bullmq'
import type { QueueRegistry } from '@/queues/index'
import { config } from '@/config'
import { logger } from '@/logger'

function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = config.internalJobSecret
  if (!secret) {
    next()
    return
  }
  if (req.headers['authorization'] !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

function resolveQueue(queues: QueueRegistry, name: string): Queue | null {
  const map: Record<string, Queue> = {
    'session-lifecycle': queues.sessionLifecycle,
    cleanup: queues.cleanup,
    email: queues.email,
    summary: queues.summary,
    recording: queues.recording,
  }
  return map[name] ?? null
}

/** POST /queues/:queue/enqueue — add a single job to a named queue. */
export function createEnqueueRouter(queues: QueueRegistry): Router {
  const router = Router()
  router.use(internalAuth)

  router.post('/:queue/enqueue', async (req, res) => {
    const queue = resolveQueue(queues, req.params.queue)
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' })
      return
    }

    const { name, data, opts } = req.body as { name?: string; data?: unknown; opts?: Record<string, unknown> }
    if (!name) {
      res.status(400).json({ error: 'Missing required field: name' })
      return
    }

    try {
      const job = await queue.add(name, data ?? {}, opts)
      logger.info('enqueue', 'Job enqueued by backend', {
        queue: req.params.queue,
        jobId: job.id,
        jobName: name,
      })
      res.json({ ok: true, jobId: job.id })
    } catch (err) {
      logger.error('enqueue', 'Failed to enqueue job', {
        queue: req.params.queue,
        jobName: name,
        error: String(err),
      })
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
