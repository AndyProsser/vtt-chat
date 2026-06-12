/**
 * Internal job trigger endpoints — called by the queues service workers, not by clients.
 *
 * Reachable only within the Docker network (backend:3000/api/internal/*).
 * Protected by INTERNAL_JOB_SECRET Bearer token when configured.
 * Not routed through Caddy — never accessible from the public internet.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { sessionCleanupJobService } from '@/services/session/cleanup-job.service'
import { config } from '@/infra/config'
import { logger } from '@/utils'

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

const router = Router()
router.use(internalAuth)

/** Run one lifecycle sweep (COOLDOWN → ENDED, ENDED → CLEANUP). */
router.post('/jobs/trigger/lifecycle-sweep', async (_req, res) => {
  try {
    await sessionCleanupJobService.runLifecycleWorkerOnce()
    logger.info('internal', 'Lifecycle sweep triggered by queue worker')
    res.json({ ok: true })
  } catch (err) {
    logger.error('internal', 'Lifecycle sweep failed', { error: String(err) })
    res.status(500).json({ error: String(err) })
  }
})

/** Run one archive verification pass (CLEANUP age verification + greenroom purge). */
router.post('/jobs/trigger/archive-verify', async (_req, res) => {
  try {
    await sessionCleanupJobService.runArchiveWorkerOnce()
    logger.info('internal', 'Archive verify triggered by queue worker')
    res.json({ ok: true })
  } catch (err) {
    logger.error('internal', 'Archive verify failed', { error: String(err) })
    res.status(500).json({ error: String(err) })
  }
})

export default router
