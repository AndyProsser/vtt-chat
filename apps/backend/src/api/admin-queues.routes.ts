/**
 * Admin proxy for the queues service inspection API.
 *
 * Routes under /api/admin/queues/* are protected by adminAuthMiddleware and
 * forwarded to the queues service (QUEUES_URL) with the INTERNAL_JOB_SECRET
 * bearer token. Returns 503 when the queues service is not configured.
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { adminAuthMiddleware } from '@/infra/http/middleware'
import { config } from '@/infra/config'
import { logger } from '@/utils'

const router = Router()
router.use(adminAuthMiddleware)

function queuesHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.internalJobSecret) {
    headers['Authorization'] = `Bearer ${config.internalJobSecret}`
  }
  return headers
}

async function proxyToQueues(
  path: string,
  method: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  if (!config.queuesUrl) {
    return { status: 503, data: { error: 'Queues service not configured (QUEUES_URL not set)' } }
  }

  const url = `${config.queuesUrl}${path}`
  const res = await fetch(url, {
    method,
    headers: queuesHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  const data: unknown = await res
    .json()
    .catch(() => ({ error: 'Non-JSON response from queues service' }))
  return { status: res.status, data }
}

function handleProxy(path: (req: Request) => string, method: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, data } = await proxyToQueues(
        path(req),
        method,
        method !== 'GET' && method !== 'DELETE' ? req.body : undefined
      )
      res.status(status).json(data)
    } catch (err) {
      logger.error('admin-queues', 'Proxy call to queues service failed', { error: String(err) })
      next(err)
    }
  }
}

/** GET /api/admin/queues — list all queues with job counts. */
router.get(
  '/',
  handleProxy(() => '/queues', 'GET')
)

/** GET /api/admin/queues/:queue/jobs?state=failed&start=0&end=24 */
router.get(
  '/:queue/jobs',
  handleProxy(
    (req) =>
      `/queues/${req.params.queue}/jobs?state=${req.query['state'] ?? 'failed'}&start=${req.query['start'] ?? 0}&end=${req.query['end'] ?? 24}`,
    'GET'
  )
)

/** POST /api/admin/queues/:queue/jobs/:id/retry */
router.post(
  '/:queue/jobs/:id/retry',
  handleProxy((req) => `/queues/${req.params.queue}/jobs/${req.params.id}/retry`, 'POST')
)

/** DELETE /api/admin/queues/:queue/jobs/:id */
router.delete(
  '/:queue/jobs/:id',
  handleProxy((req) => `/queues/${req.params.queue}/jobs/${req.params.id}`, 'DELETE')
)

/** POST /api/admin/queues/:queue/obliterate */
router.post(
  '/:queue/obliterate',
  handleProxy((req) => `/queues/${req.params.queue}/obliterate`, 'POST')
)

export default router
