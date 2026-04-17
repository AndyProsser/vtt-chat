import { Request, Response, Router } from 'express'
import authRoutes from './auth.routes'
import sessionRoutes from './session.routes'
import chatRoutes from './chat.routes'

const router = Router()

/**
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    mode: 'stage-1',
    timestamp: new Date().toISOString(),
    message: 'Backend is running with auth, session, and websocket support',
  })
})

/**
 * Implemented routes
 */
router.use('/auth', authRoutes)
router.use('/session', sessionRoutes)
router.use('/chat', chatRoutes)

/**
 * Placeholder routes (not yet implemented)
 */
function notImplemented(domain: string) {
  return (_req: Request, res: Response) => {
    res.status(501).json({
      code: 'NOT_IMPLEMENTED',
      domain,
      message: `${domain} not yet implemented`,
      stage: 'stage-1',
    })
  }
}

// Stubs for future stages
router.use('/admin', (_req: Request, res: Response) => notImplemented('admin')(_req, res))
router.use('/metadata', (_req: Request, res: Response) => notImplemented('metadata')(_req, res))
router.use('/notes', (_req: Request, res: Response) => notImplemented('notes')(_req, res))
router.use('/audio', (_req: Request, res: Response) => notImplemented('audio')(_req, res))
router.use('/presence', (_req: Request, res: Response) => notImplemented('presence')(_req, res))
router.use('/rooms', (_req: Request, res: Response) => notImplemented('rooms')(_req, res))
router.use('/export', (_req: Request, res: Response) => notImplemented('export')(_req, res))

export default router
