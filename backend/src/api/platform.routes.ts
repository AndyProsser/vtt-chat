import { Router, Request, Response } from 'express'
import { getPlatformStatus } from '@/services/guest-auth'
import { getLobbyStatsSnapshot } from '@/services/lobby/lobby-stats.service'

const router = Router()

router.get('/status', async (_req: Request, res: Response) => {
  const platformStatus = await getPlatformStatus()
  const lobbyStats = await getLobbyStatsSnapshot(platformStatus)
  res.status(200).json({
    ...platformStatus,
    lobbyStats,
  })
})

export default router
