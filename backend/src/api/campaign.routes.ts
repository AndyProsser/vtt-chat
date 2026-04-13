import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware } from '@/infra/http/middleware'
import { SessionService } from '@/core/session/session.service'
import { logger } from '@/utils/logger'

const router = Router()
const prisma = new PrismaClient()
const sessionService = new SessionService(prisma)

// ============================================================================
// Campaign/Session Management
// ============================================================================

/**
 * GET /api/campaigns
 * List campaigns for current user
 * Query: { limit?, offset?, includeArchived? }
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const includeArchived = req.query.includeArchived === 'true'
    const sessions = await sessionService.getUserSessions(req.user.userId, includeArchived)

    res.status(200).json({ sessions })
  } catch (error) {
    throw error
  }
})

/**
 * POST /api/campaigns
 * Create new campaign
 * Body: { name, description? }
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const { name, description } = req.body

    const session = await sessionService.createSession(req.user.userId, name, description)

    res.status(201).json({ session })
  } catch (error) {
    throw error
  }
})

/**
 * GET /api/campaigns/:campaignId
 * Get campaign details
 */
router.get('/:campaignId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const session = await sessionService.getSession(req.params.campaignId as string)

    res.status(200).json({ session })
  } catch (error) {
    throw error
  }
})

/**
 * POST /api/campaigns/:campaignId/end
 * End campaign (make inactive)
 */
router.post('/:campaignId/end', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const session = await sessionService.getSession(req.params.campaignId as string)

    // Only DM can end session
    if (session.dm !== req.user.username) {
      res.status(403).json({ error: 'Only DM can end campaign', code: 'FORBIDDEN' })
      return
    }

    const updated = await sessionService.endSession(req.params.campaignId as string)

    res.status(200).json({ session: updated })
  } catch (error) {
    throw error
  }
})

/**
 * POST /api/campaigns/:campaignId/archive
 * Archive campaign
 */
router.post('/:campaignId/archive', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const session = await sessionService.getSession(req.params.campaignId as string)

    // Only DM can archive session
    if (session.dm !== req.user.username) {
      res.status(403).json({ error: 'Only DM can archive campaign', code: 'FORBIDDEN' })
      return
    }

    const updated = await sessionService.archiveSession(req.params.campaignId as string)

    res.status(200).json({ session: updated })
  } catch (error) {
    throw error
  }
})

export default router
