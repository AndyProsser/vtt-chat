import { Router, Request, Response } from 'express'

const router = Router()

/**
 * GET /api/health
 * Health check endpoint - returns 200 if OK
 */
router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

export default router
