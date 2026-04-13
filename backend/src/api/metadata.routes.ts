import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authMiddleware } from '@/infra/http/middleware'
import { MetadataService } from '@/core/metadata/metadata.service'
import { logger } from '@/utils/logger'

const router = Router()
const prisma = new PrismaClient()
const metadataService = new MetadataService(prisma)

// ============================================================================
// Metadata (Game Cards) Management
// ============================================================================

/**
 * GET /api/metadata/campaigns/:campaignId
 * List metadata in campaign
 * Query: { roomId?, limit?, offset? }
 */
router.get('/campaigns/:campaignId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.params.campaignId as string
    const roomId = req.query.roomId as string | undefined

    // If roomId specified, fetch from that room
    if (roomId) {
      const metadata = await metadataService.getRoomMetadata(
        campaignId,
        roomId,
        50,
        0
      )
      res.status(200).json({ metadata })
    } else {
      // Get all metadata in campaign across all rooms
      const metadata = await prisma.metadata.findMany({
        where: { sessionId: campaignId },
        include: { tags: true },
        orderBy: { createdAt: 'desc' },
      })
      res.status(200).json({ metadata })
    }
  } catch (error) {
    throw error
  }
})

/**
 * POST /api/metadata/campaigns/:campaignId
 * Create new metadata card
 * Body: { roomId, type, title, description?, tags? }
 */
router.post('/campaigns/:campaignId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.params.campaignId as string
    const { roomId, type, title, description, tags } = req.body

    const metadata = await metadataService.createMetadata(
      campaignId,
      roomId,
      req.user.userId,
      type,
      title,
      description,
      tags || []
    )

    res.status(201).json({ metadata })
  } catch (error) {
    throw error
  }
})

/**
 * PUT /api/metadata/:metadataId
 * Update metadata card
 * Body: { title?, description? }
 */
router.put('/:metadataId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.query.campaignId as string | undefined
    const metadataId = req.params.metadataId as string
    const { title, description } = req.body

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId required in query', code: 'INVALID_INPUT' })
      return
    }

    const metadata = await metadataService.updateMetadata(
      campaignId,
      metadataId,
      req.user.userId,
      title,
      description
    )

    res.status(200).json({ metadata })
  } catch (error) {
    throw error
  }
})

/**
 * DELETE /api/metadata/:metadataId
 * Delete metadata card
 */
router.delete('/:metadataId', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' })
      return
    }

    const campaignId = req.query.campaignId as string | undefined
    const metadataId = req.params.metadataId as string

    if (!campaignId) {
      res.status(400).json({ error: 'campaignId required in query', code: 'INVALID_INPUT' })
      return
    }

    await metadataService.deleteMetadata(campaignId, metadataId, req.user.userId)

    res.status(200).json({ message: 'Metadata deleted' })
  } catch (error) {
    throw error
  }
})

export default router
