import { Request, Response, Router, NextFunction } from 'express'
import { getPrismaClient } from '@/infra/db'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { ErrorCode, isValidUUID } from '@shared'

const router = Router()
const prisma = getPrismaClient()

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Missing Authorization header' })
  }

  const user = verifyToken(token)
  if (!user) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' })
  }

  ;(req as any).user = user
  next()
}

/**
 * POST /api/integrations/external/sync
 *
 * Pushes character or campaign data updates from the extension.
 * Applies updates based on the campaign's `extensionSyncPolicy` and the caller's role.
 *
 * Requires authentication (guest or full token).
 */
router.post('/external/sync', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId, externalSystem, source, characterUpdate, campaignUpdate } = req.body || {}

  // Validate required fields
  if (!campaignId || typeof campaignId !== 'string' || !isValidUUID(campaignId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'campaignId must be a valid UUID',
      field: 'campaignId',
    })
  }

  if (!externalSystem || typeof externalSystem !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'externalSystem is required',
      field: 'externalSystem',
    })
  }

  if (!source || !['player', 'dm'].includes(source)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'source must be "player" or "dm"',
      field: 'source',
    })
  }

  try {
    // Verify campaign membership
    const membership = await prisma.campaignMembership.findUnique({
      where: {
        campaignId_userId: {
          campaignId,
          userId: user.userId,
        },
      },
      include: {
        campaign: {
          select: {
            extensionSyncPolicy: true,
            currentDmId: true,
          },
        },
      },
    })

    if (!membership) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Not a member of this campaign',
      })
    }

    const campaign = membership.campaign
    const isDm = campaign.currentDmId === user.userId
    const syncPolicy = campaign.extensionSyncPolicy

    // Determine if update is allowed based on sync policy
    let allowUpdate = false
    if (syncPolicy === 'NONE') {
      allowUpdate = false
    } else if (syncPolicy === 'DM_ONLY') {
      allowUpdate = isDm
    } else if (syncPolicy === 'DM_AND_PLAYERS') {
      allowUpdate = true
    }

    if (!allowUpdate) {
      return res.status(403).json({
        code: 'SYNC_POLICY_VIOLATION',
        message: `Sync policy "${syncPolicy}" does not permit updates from ${source}${isDm ? '' : 's'}`,
      })
    }

    // Apply character update if provided
    if (characterUpdate && typeof characterUpdate === 'object') {
      const { externalCharacterId, level } = characterUpdate as {
        externalCharacterId?: string
        level?: number
      }

      if (!externalCharacterId) {
        return res.status(400).json({
          code: ErrorCode.INVALID_INPUT,
          message: 'characterUpdate.externalCharacterId is required',
          field: 'characterUpdate.externalCharacterId',
        })
      }

      // Find and update character by external ID
      const character = await prisma.character.findFirst({
        where: {
          campaignId,
          externalId: externalCharacterId.toString(),
          externalSystem,
        },
      })

      if (character) {
        const updateData: Record<string, any> = {}
        if (typeof level === 'number') {
          const metadata = (character.metadata as Record<string, any> | null) || {}
          updateData.metadata = { ...metadata, level }
        }
        if ((characterUpdate as any).class) updateData.class = (characterUpdate as any).class
        if ((characterUpdate as any).subclass)
          updateData.subclass = (characterUpdate as any).subclass

        if (Object.keys(updateData).length > 0) {
          await prisma.character.update({
            where: { id: character.id },
            data: updateData,
          })
        }
      }
    }

    // Log the sync action for audit
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: user.userId,
        actorName: user.username,
        actorRole: user.role || user.adminRole,
        action: 'external_sync',
        targetType: 'Campaign',
        targetId: campaignId,
        outcome: 'SUCCESS',
        metadata: {
          externalSystem,
          source,
          characterUpdateApplied: !!characterUpdate,
          campaignUpdateApplied: !!campaignUpdate,
        },
      },
    })

    return res.status(200).json({
      message: 'Sync completed successfully',
      applied: {
        characterUpdate: !!characterUpdate,
        campaignUpdate: !!campaignUpdate,
      },
    })
  } catch (error) {
    console.error('[integrations.sync]', error)
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to sync external data',
    })
  }
})

export default router
