/**
 * Inventory Routes
 * REST API for campaign-scoped character and party inventory.
 * All mutations persist to PostgreSQL, then broadcast a WS event.
 * Reference: docs/subsystems/INVENTORY-SYSTEM.md
 */

import crypto from 'node:crypto'
import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { InventoryItemSource, isValidUUID } from '@shared'
import type { UUID } from '@shared'
import { verifyToken } from '@/services/auth.service'
import { getCampaignForUser } from '@/repositories/campaign.repository'
import { getSession } from '@/services/session/core.service'
import {
  getCampaignInventory,
  getInventoryHistory,
  addInventoryItem,
  editInventoryItem,
  removeInventoryItem,
  transferInventoryItem,
  adjustCurrency,
} from '@/services/inventory/inventory.service'
import type { WebSocketManager } from '@/ws'
import type { EventEnvelope } from '@shared'
import { logger } from '@/utils'
import { listCampaignMemberIds } from '@/repositories/campaign.repository'

const router = Router()

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing Authorization header' })
  }
  const user = verifyToken(token)
  if (!user) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' })
  }
  ;(req as any).user = user
  next()
}

async function resolveCampaignRole(
  campaignId: UUID,
  userId: UUID
): Promise<'DM' | 'PLAYER' | 'SPECTATOR' | null> {
  const campaign = await getCampaignForUser({ campaignId, userId })
  if (!campaign) return null
  if (campaign.currentDmId === userId) return 'DM'
  return (campaign.memberRole as 'PLAYER' | 'SPECTATOR') ?? null
}

/** Resolves the active session for a campaign if one exists. Returns null if none. */
async function getActiveSession(campaignId: UUID) {
  try {
    return await getSession(campaignId)
  } catch {
    return null
  }
}

// ─── GET /api/inventory/:campaignId ──────────────────────────────────────────

router.get('/:campaignId', requireAuth, async (req: Request, res: Response) => {
  const { campaignId } = req.params
  const user = (req as any).user

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid campaignId' })
  }

  const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!role) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Not a campaign member' })
  }

  try {
    const inventory = await getCampaignInventory(campaignId as UUID)
    return res.json(inventory)
  } catch (err) {
    logger.error('inventory.routes', 'Failed to fetch inventory', { campaignId, err })
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch inventory' })
  }
})

// ─── GET /api/inventory/:campaignId/history ───────────────────────────────────

router.get('/:campaignId/history', requireAuth, async (req: Request, res: Response) => {
  const { campaignId } = req.params
  const user = (req as any).user
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid campaignId' })
  }

  const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!role) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Not a campaign member' })
  }

  try {
    const history = await getInventoryHistory(campaignId as UUID, limit, offset)
    return res.json({ history })
  } catch (err) {
    logger.error('inventory.routes', 'Failed to fetch inventory history', { campaignId, err })
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to fetch history' })
  }
})

// ─── POST /api/inventory/:campaignId/items ────────────────────────────────────

router.post('/:campaignId/items', requireAuth, async (req: Request, res: Response) => {
  const { campaignId } = req.params
  const user = (req as any).user
  const { ownerType, ownerId, name, quantity, source, srdKey, notes } = req.body

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid campaignId' })
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Item name is required' })
  }
  if (!['party', 'character'].includes(ownerType)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'ownerType must be party or character' })
  }
  if (ownerType === 'character' && !isValidUUID(ownerId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'ownerId required for character items' })
  }

  const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!role) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Not a campaign member' })
  }
  if (role === 'SPECTATOR') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Spectators cannot modify inventory' })
  }

  try {
    const session = await getActiveSession(campaignId as UUID)
    const item = await addInventoryItem({
      campaignId: campaignId as UUID,
      ownerType,
      ownerId: ownerId ?? null,
      name: name.trim(),
      quantity: Math.max(1, Number(quantity) || 1),
      source: source === 'SRD' ? InventoryItemSource.SRD : InventoryItemSource.CUSTOM,
      srdKey: srdKey ?? undefined,
      notes: notes ?? undefined,
      addedByUserId: user.userId as UUID,
      sessionId: session?.id as UUID | undefined,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager && session) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:ITEM_ADDED',
        version: 1,
        userId: user.userId as UUID,
        userRole: role as any,
        sessionId: session.id as UUID,
        roomId: null,
        timestamp: item.createdAt,
        payload: {
          campaignId: item.campaignId,
          itemId: item.id,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          name: item.name,
          quantity: item.quantity,
          source: item.source,
          srdKey: item.srdKey,
          notes: item.notes,
          addedByUserId: item.addedByUserId,
          addedAt: item.createdAt,
        },
      }
      const memberIds = await listCampaignMemberIds(campaignId as UUID)
      wsManager.broadcastEventToSession(session.id as UUID, event, memberIds as UUID[])
    }

    return res.status(201).json({ item })
  } catch (err) {
    logger.error('inventory.routes', 'Failed to add item', { campaignId, err })
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to add item' })
  }
})

// ─── PATCH /api/inventory/:campaignId/items/:itemId ──────────────────────────

router.patch('/:campaignId/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  const { campaignId, itemId } = req.params
  const user = (req as any).user
  const { name, quantity, notes } = req.body

  if (!isValidUUID(campaignId) || !isValidUUID(itemId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid id' })
  }

  const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!role || role === 'SPECTATOR') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' })
  }

  try {
    const session = await getActiveSession(campaignId as UUID)
    const item = await editInventoryItem({
      itemId: itemId as UUID,
      campaignId: campaignId as UUID,
      name: name?.trim(),
      quantity: quantity !== undefined ? Math.max(1, Number(quantity)) : undefined,
      notes: notes ?? undefined,
      actorUserId: user.userId as UUID,
      sessionId: session?.id as UUID | undefined,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager && session) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:ITEM_EDITED',
        version: 1,
        userId: user.userId as UUID,
        userRole: role as any,
        sessionId: session.id as UUID,
        roomId: null,
        timestamp: item.updatedAt,
        payload: {
          campaignId: item.campaignId,
          itemId: item.id,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          name: item.name,
          quantity: item.quantity,
          notes: item.notes,
          editedByUserId: user.userId,
          editedAt: item.updatedAt,
        },
      }
      const memberIds = await listCampaignMemberIds(campaignId as UUID)
      wsManager.broadcastEventToSession(session.id as UUID, event, memberIds as UUID[])
    }

    return res.json({ item })
  } catch (err) {
    logger.error('inventory.routes', 'Failed to edit item', { campaignId, itemId, err })
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to edit item' })
  }
})

// ─── DELETE /api/inventory/:campaignId/items/:itemId ─────────────────────────

router.delete('/:campaignId/items/:itemId', requireAuth, async (req: Request, res: Response) => {
  const { campaignId, itemId } = req.params
  const user = (req as any).user

  if (!isValidUUID(campaignId) || !isValidUUID(itemId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid id' })
  }

  const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!role || role === 'SPECTATOR') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' })
  }

  try {
    const session = await getActiveSession(campaignId as UUID)
    const item = await removeInventoryItem({
      itemId: itemId as UUID,
      campaignId: campaignId as UUID,
      actorUserId: user.userId as UUID,
      sessionId: session?.id as UUID | undefined,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager && session) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:ITEM_REMOVED',
        version: 1,
        userId: user.userId as UUID,
        userRole: role as any,
        sessionId: session.id as UUID,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          campaignId: campaignId as UUID,
          itemId: item.id,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          name: item.name,
          quantity: item.quantity,
          removedByUserId: user.userId,
          removedAt: Date.now(),
        },
      }
      const memberIds = await listCampaignMemberIds(campaignId as UUID)
      wsManager.broadcastEventToSession(session.id as UUID, event, memberIds as UUID[])
    }

    return res.json({ success: true })
  } catch (err) {
    logger.error('inventory.routes', 'Failed to remove item', { campaignId, itemId, err })
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to remove item' })
  }
})

// ─── POST /api/inventory/:campaignId/items/:itemId/transfer ──────────────────

router.post(
  '/:campaignId/items/:itemId/transfer',
  requireAuth,
  async (req: Request, res: Response) => {
    const { campaignId, itemId } = req.params
    const user = (req as any).user
    const { toOwnerType, toOwnerId } = req.body

    if (!isValidUUID(campaignId) || !isValidUUID(itemId)) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid id' })
    }
    if (!['party', 'character'].includes(toOwnerType)) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'toOwnerType must be party or character' })
    }

    const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
    if (!role || role === 'SPECTATOR') {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' })
    }

    try {
      const session = await getActiveSession(campaignId as UUID)
      const item = await transferInventoryItem({
        itemId: itemId as UUID,
        campaignId: campaignId as UUID,
        toOwnerType,
        toOwnerId: toOwnerId ?? null,
        actorUserId: user.userId as UUID,
        sessionId: session?.id as UUID | undefined,
      })

      const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
      if (wsManager && session) {
        const event: EventEnvelope = {
          id: crypto.randomUUID() as UUID,
          type: 'INVENTORY:ITEM_TRANSFERRED',
          version: 1,
          userId: user.userId as UUID,
          userRole: role as any,
          sessionId: session.id as UUID,
          roomId: null,
          timestamp: item.updatedAt,
          payload: {
            campaignId: item.campaignId,
            itemId: item.id,
            name: item.name,
            quantity: item.quantity,
            fromOwnerType: item.ownerType,
            fromOwnerId: item.ownerId,
            toOwnerType,
            toOwnerId: toOwnerId ?? null,
            transferredByUserId: user.userId,
            transferredAt: item.updatedAt,
          },
        }
        const memberIds = await listCampaignMemberIds(campaignId as UUID)
        wsManager.broadcastEventToSession(session.id as UUID, event, memberIds as UUID[])
      }

      return res.json({ item })
    } catch (err) {
      logger.error('inventory.routes', 'Failed to transfer item', { campaignId, itemId, err })
      return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to transfer item' })
    }
  }
)

// ─── POST /api/inventory/:campaignId/currency ────────────────────────────────

router.post('/:campaignId/currency', requireAuth, async (req: Request, res: Response) => {
  const { campaignId } = req.params
  const user = (req as any).user
  const { ownerType, ownerId, delta } = req.body

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid campaignId' })
  }
  if (!['party', 'character'].includes(ownerType)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'ownerType must be party or character' })
  }
  if (!delta || typeof delta !== 'object') {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'delta is required' })
  }

  const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!role || role === 'SPECTATOR') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' })
  }

  try {
    const session = await getActiveSession(campaignId as UUID)
    const wallet = await adjustCurrency({
      campaignId: campaignId as UUID,
      ownerType,
      ownerId: ownerId ?? null,
      delta: {
        cp: Number(delta.cp) || 0,
        sp: Number(delta.sp) || 0,
        ep: Number(delta.ep) || 0,
        gp: Number(delta.gp) || 0,
        pp: Number(delta.pp) || 0,
      },
      actorUserId: user.userId as UUID,
      sessionId: session?.id as UUID | undefined,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager && session) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:CURRENCY_CHANGED',
        version: 1,
        userId: user.userId as UUID,
        userRole: role as any,
        sessionId: session.id as UUID,
        roomId: null,
        timestamp: wallet.updatedAt,
        payload: {
          campaignId: wallet.campaignId,
          walletId: wallet.id,
          ownerType: wallet.ownerType,
          ownerId: wallet.ownerId,
          delta,
          newBalance: { cp: wallet.cp, sp: wallet.sp, ep: wallet.ep, gp: wallet.gp, pp: wallet.pp },
          changedByUserId: user.userId,
          changedAt: wallet.updatedAt,
        },
      }
      const memberIds = await listCampaignMemberIds(campaignId as UUID)
      wsManager.broadcastEventToSession(session.id as UUID, event, memberIds as UUID[])
    }

    return res.json({ wallet })
  } catch (err) {
    logger.error('inventory.routes', 'Failed to update currency', { campaignId, err })
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to update currency' })
  }
})

export default router
