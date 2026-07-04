/**
 * Inventory Extension Sync Review Routes
 * DM-only review queue for extension sync conflicts queued under the campaign's
 * `extensionSyncConflictResolution: 'PROMPT'` policy.
 * Reference: docs/subsystems/INVENTORY-SYSTEM.md §8 "Pending Extension Sync", §12.3
 */

import crypto from 'node:crypto'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { isValidUUID } from '@shared'
import type { UUID, EventEnvelope } from '@shared'
import {
  requireAuth,
  resolveCampaignRole,
  getActiveSession,
  broadcastInventorySystemMessage,
  NO_SESSION_ID,
} from '@/api/inventory.routes'
import {
  listPendingSyncsForCampaign,
  approvePendingSync,
  rejectPendingSync,
} from '@/services/inventory/pending-extension-sync.service'
import type { WebSocketManager } from '@/ws'
import { logger } from '@/utils'

const router = Router()

// ─── GET /api/inventory/:campaignId/sync/pending ─────────────────────────────

router.get('/:campaignId/sync/pending', requireAuth, async (req: Request, res: Response) => {
  const { campaignId } = req.params
  const user = (req as any).user

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid campaignId' })
  }

  const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (role !== 'DM') {
    return res
      .status(403)
      .json({ code: 'FORBIDDEN', message: 'Only the campaign DM can review pending syncs' })
  }

  try {
    const pending = await listPendingSyncsForCampaign(campaignId as UUID)
    return res.json({ pending })
  } catch (err) {
    logger.error('inventory-sync.routes', 'Failed to list pending syncs', { campaignId, err })
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to list pending syncs' })
  }
})

// ─── POST /api/inventory/:campaignId/sync/pending/:pendingId/approve ─────────

router.post(
  '/:campaignId/sync/pending/:pendingId/approve',
  requireAuth,
  async (req: Request, res: Response) => {
    const { campaignId, pendingId } = req.params
    const user = (req as any).user

    if (!isValidUUID(campaignId) || !isValidUUID(pendingId)) {
      return res
        .status(400)
        .json({ code: 'INVALID_INPUT', message: 'Invalid campaignId or pendingId' })
    }

    const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
    if (role !== 'DM') {
      return res
        .status(403)
        .json({ code: 'FORBIDDEN', message: 'Only the campaign DM can approve pending syncs' })
    }

    try {
      const session = await getActiveSession(campaignId as UUID)
      const result = await approvePendingSync({
        pendingId: pendingId as UUID,
        campaignId: campaignId as UUID,
        actorUserId: user.userId as UUID,
        sessionId: session?.id as UUID | undefined,
      })

      if (!result.ok) {
        return res
          .status(404)
          .json({ code: 'NOT_FOUND', message: 'Pending sync not found or expired' })
      }

      const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
      if (wsManager) {
        const event: EventEnvelope =
          result.kind === 'ITEM'
            ? {
                id: crypto.randomUUID() as UUID,
                type: result.created ? 'INVENTORY:ITEM_ADDED' : 'INVENTORY:ITEM_EDITED',
                version: 1,
                userId: user.userId as UUID,
                userRole: 'DM' as any,
                sessionId: (session?.id ?? NO_SESSION_ID) as UUID,
                roomId: null,
                timestamp: result.item.updatedAt,
                payload: result.created
                  ? {
                      campaignId: result.item.campaignId,
                      itemId: result.item.id,
                      ownerType: result.item.ownerType,
                      ownerId: result.item.ownerId,
                      name: result.item.name,
                      quantity: result.item.quantity,
                      source: result.item.source,
                      srdKey: result.item.srdKey,
                      srdCategory: result.item.srdCategory,
                      notes: result.item.notes,
                      externalId: result.item.externalId ?? undefined,
                      externalSource: result.item.externalSource ?? undefined,
                      addedByUserId: result.item.addedByUserId,
                      addedAt: result.item.createdAt,
                    }
                  : {
                      campaignId: result.item.campaignId,
                      itemId: result.item.id,
                      ownerType: result.item.ownerType,
                      ownerId: result.item.ownerId,
                      name: result.item.name,
                      quantity: result.item.quantity,
                      notes: result.item.notes ?? undefined,
                      editedByUserId: user.userId,
                      editedAt: result.item.updatedAt,
                    },
              }
            : {
                id: crypto.randomUUID() as UUID,
                type: 'INVENTORY:CURRENCY_CHANGED',
                version: 1,
                userId: user.userId as UUID,
                userRole: 'DM' as any,
                sessionId: (session?.id ?? NO_SESSION_ID) as UUID,
                roomId: null,
                timestamp: result.wallet.updatedAt,
                payload: {
                  campaignId: result.wallet.campaignId,
                  walletId: result.wallet.id,
                  ownerType: result.wallet.ownerType,
                  ownerId: result.wallet.ownerId,
                  newBalance: {
                    cp: result.wallet.cp,
                    sp: result.wallet.sp,
                    ep: result.wallet.ep,
                    gp: result.wallet.gp,
                    pp: result.wallet.pp,
                  },
                  changedByUserId: user.userId,
                  changedAt: result.wallet.updatedAt,
                },
              }

        await wsManager.broadcastToCampaignMembers(campaignId as UUID, event)
      }

      if (session) {
        const content =
          result.kind === 'ITEM'
            ? `[Inventory] Approved extension sync: ${result.item.name} ×${result.item.quantity}.`
            : `[Inventory] Approved extension sync: currency wallet updated.`
        await broadcastInventorySystemMessage({
          session,
          content,
          actorUserId: user.userId as UUID,
          wsManager,
        })
      }

      return res.json(result.kind === 'ITEM' ? { item: result.item } : { wallet: result.wallet })
    } catch (err) {
      logger.error('inventory-sync.routes', 'Failed to approve pending sync', {
        campaignId,
        pendingId,
        err,
      })
      return res
        .status(500)
        .json({ code: 'INTERNAL_ERROR', message: 'Failed to approve pending sync' })
    }
  }
)

// ─── POST /api/inventory/:campaignId/sync/pending/:pendingId/reject ──────────

router.post(
  '/:campaignId/sync/pending/:pendingId/reject',
  requireAuth,
  async (req: Request, res: Response) => {
    const { campaignId, pendingId } = req.params
    const user = (req as any).user

    if (!isValidUUID(campaignId) || !isValidUUID(pendingId)) {
      return res
        .status(400)
        .json({ code: 'INVALID_INPUT', message: 'Invalid campaignId or pendingId' })
    }

    const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
    if (role !== 'DM') {
      return res
        .status(403)
        .json({ code: 'FORBIDDEN', message: 'Only the campaign DM can reject pending syncs' })
    }

    try {
      const rejected = await rejectPendingSync({
        pendingId: pendingId as UUID,
        campaignId: campaignId as UUID,
      })
      if (!rejected) {
        return res
          .status(404)
          .json({ code: 'NOT_FOUND', message: 'Pending sync not found or expired' })
      }
      return res.status(204).send()
    } catch (err) {
      logger.error('inventory-sync.routes', 'Failed to reject pending sync', {
        campaignId,
        pendingId,
        err,
      })
      return res
        .status(500)
        .json({ code: 'INTERNAL_ERROR', message: 'Failed to reject pending sync' })
    }
  }
)

export default router
