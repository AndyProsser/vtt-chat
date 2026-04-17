import { Request, Response, Router } from 'express'

const router = Router()

function notImplemented(domain: string) {
  return (_req: Request, res: Response) => {
    res.status(501).json({
      code: 'NOT_IMPLEMENTED',
      domain,
      message: `${domain} baseline placeholder endpoint`,
      architecture: 'ui_to_event_to_reducer_to_store_to_ui',
    })
  }
}

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    mode: 'baseline',
    timestamp: new Date().toISOString(),
  })
})

router.get('/auth', notImplemented('auth'))
router.get('/campaigns', notImplemented('campaigns'))
router.get('/admin', notImplemented('admin'))
router.get('/metadata', notImplemented('metadata'))
router.get('/notes', notImplemented('notes'))
router.get('/chat', notImplemented('chat'))
router.get('/audio', notImplemented('audio'))
router.get('/presence', notImplemented('presence'))
router.get('/session', notImplemented('session'))
router.get('/rooms', notImplemented('rooms'))
router.get('/export', notImplemented('export'))

export default router
