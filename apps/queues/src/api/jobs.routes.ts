import { Router, type Request, type Response, type NextFunction } from 'express'
import type { Queue } from 'bullmq'
import type { QueueRegistry } from '@/queues/index'
import { config } from '@/config'
import { logger } from '@/logger'

type JobState =
  'active' | 'waiting' | 'waiting-children' | 'delayed' | 'completed' | 'failed' | 'paused'

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminSecret) {
    next()
    return
  }
  const header = req.headers['authorization'] ?? ''
  if (header !== `Bearer ${config.adminSecret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
}

function getQueue(queues: QueueRegistry, name: string): Queue | null {
  const map: Record<string, Queue> = {
    'session-lifecycle': queues.sessionLifecycle,
    cleanup: queues.cleanup,
    email: queues.email,
    summary: queues.summary,
    recording: queues.recording,
    dlq: queues.dlq,
  }
  return map[name] ?? null
}

export function createJobsRouter(queues: QueueRegistry): Router {
  const router = Router()
  router.use(authMiddleware)

  /** GET /queues — list all queues with counts per state. */
  router.get('/', async (_req, res) => {
    try {
      const entries = await Promise.all(
        Object.entries({
          'session-lifecycle': queues.sessionLifecycle,
          cleanup: queues.cleanup,
          email: queues.email,
          summary: queues.summary,
          recording: queues.recording,
          dlq: queues.dlq,
        }).map(async ([name, q]) => {
          const counts = await q.getJobCounts(
            'active',
            'waiting',
            'delayed',
            'completed',
            'failed',
            'paused'
          )
          return { name, counts }
        })
      )
      res.json({ queues: entries })
    } catch (err) {
      logger.error('api', 'Failed to list queues', { error: String(err) })
      res.status(500).json({ error: 'Internal error' })
    }
  })

  /** GET /queues/:queue/jobs?state=failed&start=0&end=24 */
  router.get('/:queue/jobs', async (req, res) => {
    const queue = getQueue(queues, req.params.queue)
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' })
      return
    }

    const state = (req.query['state'] as JobState | undefined) ?? 'failed'
    const start = parseInt((req.query['start'] as string | undefined) ?? '0', 10)
    const end = parseInt((req.query['end'] as string | undefined) ?? '24', 10)

    try {
      const jobs = await queue.getJobs([state], start, end)
      res.json({
        queue: req.params.queue,
        state,
        jobs: jobs.map((j) => ({
          id: j.id,
          name: j.name,
          attemptsMade: j.attemptsMade,
          timestamp: j.timestamp,
          processedOn: j.processedOn,
          finishedOn: j.finishedOn,
          failedReason: j.failedReason,
          data: j.data,
        })),
      })
    } catch (err) {
      logger.error('api', 'Failed to get jobs', { queue: req.params.queue, error: String(err) })
      res.status(500).json({ error: 'Internal error' })
    }
  })

  /** POST /queues/:queue/jobs/:id/retry */
  router.post('/:queue/jobs/:id/retry', async (req, res) => {
    const queue = getQueue(queues, req.params.queue)
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' })
      return
    }

    try {
      const job = await queue.getJob(req.params.id)
      if (!job) {
        res.status(404).json({ error: 'Job not found' })
        return
      }
      await job.retry()
      logger.info('api', 'Job retried', { queue: req.params.queue, jobId: req.params.id })
      res.json({ ok: true })
    } catch (err) {
      logger.error('api', 'Failed to retry job', {
        queue: req.params.queue,
        jobId: req.params.id,
        error: String(err),
      })
      res.status(500).json({ error: 'Internal error' })
    }
  })

  /** DELETE /queues/:queue/jobs/:id */
  router.delete('/:queue/jobs/:id', async (req, res) => {
    const queue = getQueue(queues, req.params.queue)
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' })
      return
    }

    try {
      const job = await queue.getJob(req.params.id)
      if (!job) {
        res.status(404).json({ error: 'Job not found' })
        return
      }
      await job.remove()
      logger.info('api', 'Job removed', { queue: req.params.queue, jobId: req.params.id })
      res.json({ ok: true })
    } catch (err) {
      logger.error('api', 'Failed to remove job', {
        queue: req.params.queue,
        jobId: req.params.id,
        error: String(err),
      })
      res.status(500).json({ error: 'Internal error' })
    }
  })

  /** POST /queues/:queue/obliterate — clear ALL jobs from a queue (danger). */
  router.post('/:queue/obliterate', async (req, res) => {
    const queue = getQueue(queues, req.params.queue)
    if (!queue) {
      res.status(404).json({ error: 'Queue not found' })
      return
    }

    try {
      await queue.obliterate({ force: true })
      logger.warn('api', 'Queue obliterated', { queue: req.params.queue })
      res.json({ ok: true })
    } catch (err) {
      logger.error('api', 'Failed to obliterate queue', {
        queue: req.params.queue,
        error: String(err),
      })
      res.status(500).json({ error: 'Internal error' })
    }
  })

  return router
}
