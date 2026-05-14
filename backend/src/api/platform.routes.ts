import { Router, Request, Response } from 'express'
import { getPlatformStatus } from '@/services/guest-auth'

const router = Router()

router.get('/status', async (_req: Request, res: Response) => {
  res.status(200).json(await getPlatformStatus())
})

export default router
