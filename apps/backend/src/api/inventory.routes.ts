/**
 * Inventory Routes
 * REST API for campaign-scoped character and party inventory.
 * All mutations persist to PostgreSQL, then broadcast a WS event.
 * Reference: docs/subsystems/INVENTORY-SYSTEM.md
 */

import crypto from 'node:crypto'
import { Router } from 'express'
import type { Request, Response, NextFunction } from 'express'
import { InventoryItemSource, InventoryItemCategory, MessageType, isValidUUID } from '@shared'
import type { UUID } from '@shared'
import { verifyToken } from '@/services/auth.service'
import { getCampaignForUser } from '@/repositories/campaign.repository'

/** Sentinel used as sessionId in event envelopes when no active session exists. */
export const NO_SESSION_ID = '00000000-0000-4000-8000-000000000000' as UUID
import { listSessionsByCampaign } from '@/repositories/session.repository'
import { sendMessage } from '@/services/chat.service'
import {
  getCampaignInventory,
  getInventoryHistory,
  addInventoryItem,
  editInventoryItem,
  removeInventoryItem,
  transferInventoryItem,
  adjustCurrency,
  transferCurrency,
  type CurrencyDenomination,
} from '@/services/inventory/inventory.service'
import type { WebSocketManager } from '@/ws'
import type { EventEnvelope } from '@shared'
import { logger } from '@/utils'

const router = Router()

// ─── Auth middleware ──────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction) {
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

export async function resolveCampaignRole(
  campaignId: UUID,
  userId: UUID
): Promise<'DM' | 'PLAYER' | 'SPECTATOR' | null> {
  const campaign = await getCampaignForUser({ campaignId, userId })
  if (!campaign) return null
  if (campaign.currentDmId === userId) return 'DM'
  return (campaign.memberRole as 'PLAYER' | 'SPECTATOR') ?? null
}

/** Resolves the ACTIVE or PAUSED session for a campaign. Returns null if none. */
export async function getActiveSession(campaignId: UUID) {
  try {
    const sessions = await listSessionsByCampaign(campaignId)
    return sessions.find((s) => s.state === 'ACTIVE' || s.state === 'PAUSED') ?? null
  } catch {
    return null
  }
}

/**
 * Emit a CHAT:MESSAGE_SENT system message and WS event after an inventory mutation.
 * Only fires if the session is ACTIVE (paused sessions don't chat).
 */
export async function broadcastInventorySystemMessage(params: {
  session: { id: string; dmId: string; state: string }
  content: string
  actorUserId: UUID
  wsManager: WebSocketManager | undefined
}): Promise<void> {
  const { session, content, actorUserId, wsManager } = params
  if (session.state !== 'ACTIVE') return

  const message = await sendMessage({
    sessionId: session.id as UUID,
    authorId: actorUserId,
    authorUsername: 'SYSTEM',
    dmId: session.dmId as UUID,
    content,
    type: MessageType.SYSTEM,
  })

  if (wsManager) {
    const event: EventEnvelope = {
      id: crypto.randomUUID() as UUID,
      type: 'CHAT:MESSAGE_SENT',
      version: 1,
      userId: actorUserId,
      userRole: 'SYSTEM' as any,
      sessionId: session.id as UUID,
      roomId: null,
      timestamp: message.createdAt,
      payload: {
        messageId: message.id,
        authorId: message.authorId,
        authorUsername: message.authorUsername,
        content: message.content,
        type: message.type,
        isDmOnly: false,
        isOffTheRecord: false,
      },
    }
    wsManager.broadcastEventToSession(session.id as UUID, event)
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
  const limit = Math.min(Number(req.query.limit) || 100, 200)
  const offset = Number(req.query.offset) || 0
  const ownerType = req.query.ownerType as 'party' | 'character' | undefined
  const ownerId = (req.query.ownerId as string | undefined) ?? undefined
  const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined
  const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid campaignId' })
  }
  if (ownerType && !['party', 'character'].includes(ownerType)) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'ownerType must be party or character' })
  }
  if (dateFrom && isNaN(dateFrom.getTime())) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid dateFrom' })
  }
  if (dateTo && isNaN(dateTo.getTime())) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid dateTo' })
  }

  const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
  if (!role) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Not a campaign member' })
  }

  try {
    type HistoryFilters = {
      ownerType?: 'party' | 'character'
      ownerId?: string | null
      dateFrom?: Date
      dateTo?: Date
      viewerUserId?: string
    }

    let historyParams: HistoryFilters = { ownerType, dateFrom, dateTo }

    if (role === 'DM') {
      // DM sees all; honour explicit filters as-is
      historyParams.ownerId = ownerType === 'character' ? (ownerId ?? null) : undefined
    } else {
      // Players/spectators: enforce visibility to own character + party only
      if (ownerType === 'character') {
        if (ownerId && ownerId !== user.userId) {
          return res.status(403).json({ code: 'FORBIDDEN', message: "Cannot view other players' inventory history" })
        }
        // Restrict to own userId even if ownerId was absent
        historyParams.ownerId = user.userId
      } else if (!ownerType) {
        // No filter specified → show own character + party (combined player view)
        historyParams = { dateFrom, dateTo, viewerUserId: user.userId }
      }
      // ownerType === 'party' → no change, party is always visible to members
    }

    const history = await getInventoryHistory(campaignId as UUID, limit, offset, historyParams)
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
  const { ownerType, ownerId, name, quantity, source, srdKey, srdCategory, notes, externalId, externalSource } = req.body
  const VALID_CATEGORIES = ['EQUIPMENT', 'MAGIC_ITEM', 'HOMEBREW']
  const effectiveSrdCategory: InventoryItemCategory = VALID_CATEGORIES.includes(srdCategory)
    ? (srdCategory as InventoryItemCategory)
    : InventoryItemCategory.EQUIPMENT

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
      source:
        source === 'SRD'
          ? InventoryItemSource.SRD
          : source === 'EXTERNAL'
            ? InventoryItemSource.EXTERNAL
            : InventoryItemSource.CUSTOM,
      srdKey: srdKey ?? undefined,
      srdCategory: effectiveSrdCategory,
      notes: notes ?? undefined,
      externalId: typeof externalId === 'string' ? externalId.trim() : undefined,
      externalSource: typeof externalSource === 'string' ? externalSource.trim() : undefined,
      addedByUserId: user.userId as UUID,
      sessionId: session?.id as UUID | undefined,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:ITEM_ADDED',
        version: 1,
        userId: user.userId as UUID,
        userRole: role as any,
        sessionId: (session?.id ?? NO_SESSION_ID) as UUID,
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
          srdCategory: item.srdCategory,
          notes: item.notes,
          externalId: item.externalId ?? undefined,
          externalSource: item.externalSource ?? undefined,
          addedByUserId: item.addedByUserId,
          addedAt: item.createdAt,
        },
      }
      await wsManager.broadcastToCampaignMembers(campaignId as UUID, event)
    }

    if (session) {
      const dest = ownerType === 'party' ? 'party inventory' : 'character inventory'
      await broadcastInventorySystemMessage({
        session,
        content: `[Inventory] ${item.name} ×${item.quantity} added to ${dest}.`,
        actorUserId: user.userId as UUID,
        wsManager,
      })
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
    if (wsManager) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:ITEM_EDITED',
        version: 1,
        userId: user.userId as UUID,
        userRole: role as any,
        sessionId: (session?.id ?? NO_SESSION_ID) as UUID,
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
      await wsManager.broadcastToCampaignMembers(campaignId as UUID, event)
    }

    if (session) {
      await broadcastInventorySystemMessage({
        session,
        content: `[Inventory] ${item.name} updated (×${item.quantity}).`,
        actorUserId: user.userId as UUID,
        wsManager,
      })
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
    if (wsManager) {
      const removedAt = Date.now()
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:ITEM_REMOVED',
        version: 1,
        userId: user.userId as UUID,
        userRole: role as any,
        sessionId: (session?.id ?? NO_SESSION_ID) as UUID,
        roomId: null,
        timestamp: removedAt,
        payload: {
          campaignId: campaignId as UUID,
          itemId: item.id,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          name: item.name,
          quantity: item.quantity,
          removedByUserId: user.userId,
          removedAt,
        },
      }
      await wsManager.broadcastToCampaignMembers(campaignId as UUID, event)
    }

    if (session) {
      await broadcastInventorySystemMessage({
        session,
        content: `[Inventory] ${item.name} ×${item.quantity} removed.`,
        actorUserId: user.userId as UUID,
        wsManager,
      })
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
      if (wsManager) {
        const event: EventEnvelope = {
          id: crypto.randomUUID() as UUID,
          type: 'INVENTORY:ITEM_TRANSFERRED',
          version: 1,
          userId: user.userId as UUID,
          userRole: role as any,
          sessionId: (session?.id ?? NO_SESSION_ID) as UUID,
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
        await wsManager.broadcastToCampaignMembers(campaignId as UUID, event)
      }

      if (session) {
        const dest = toOwnerType === 'party' ? 'party inventory' : 'character inventory'
        await broadcastInventorySystemMessage({
          session,
          content: `[Inventory] ${item.name} ×${item.quantity} moved to ${dest}.`,
          actorUserId: user.userId as UUID,
          wsManager,
        })
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
    if (wsManager) {
      const event: EventEnvelope = {
        id: crypto.randomUUID() as UUID,
        type: 'INVENTORY:CURRENCY_CHANGED',
        version: 1,
        userId: user.userId as UUID,
        userRole: role as any,
        sessionId: (session?.id ?? NO_SESSION_ID) as UUID,
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
      await wsManager.broadcastToCampaignMembers(campaignId as UUID, event)
    }

    if (session) {
      const parts = (['pp', 'gp', 'ep', 'sp', 'cp'] as const)
        .filter((k) => delta[k] && delta[k] !== 0)
        .map((k) => `${delta[k] > 0 ? '+' : ''}${delta[k]}${k}`)
        .join(', ')
      const dest = ownerType === 'party' ? 'party purse' : 'character wallet'
      if (parts) {
        await broadcastInventorySystemMessage({
          session,
          content: `[Inventory] Currency updated (${parts}) in ${dest}.`,
          actorUserId: user.userId as UUID,
          wsManager,
        })
      }
    }

    return res.json({ wallet })
  } catch (err) {
    logger.error('inventory.routes', 'Failed to update currency', { campaignId, err })
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to update currency' })
  }
})

// ─── POST /api/inventory/:campaignId/transfer/currency ───────────────────────
// Atomic two-sided transfer: debit fromOwner, credit toOwner in one transaction.
// Returns 400 with INSUFFICIENT_FUNDS + denomination shortfall if source can't cover.

router.post(
  '/:campaignId/transfer/currency',
  requireAuth,
  async (req: Request, res: Response) => {
    const { campaignId } = req.params
    const user = (req as any).user
    const { fromOwnerType, fromOwnerId, toOwnerType, toOwnerId, amounts } = req.body

    if (!isValidUUID(campaignId)) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'Invalid campaignId' })
    }
    if (!['party', 'character'].includes(fromOwnerType)) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'fromOwnerType must be party or character' })
    }
    if (!['party', 'character'].includes(toOwnerType)) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'toOwnerType must be party or character' })
    }
    if (!amounts || typeof amounts !== 'object') {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'amounts is required' })
    }

    const DENOMS: CurrencyDenomination[] = ['cp', 'sp', 'ep', 'gp', 'pp']
    const normalizedAmounts: Partial<Record<CurrencyDenomination, number>> = {}
    for (const denom of DENOMS) {
      const v = Number(amounts[denom] ?? 0)
      if (v < 0 || !Number.isFinite(v)) {
        return res.status(400).json({ code: 'INVALID_INPUT', message: `${denom} must be a non-negative number` })
      }
      if (v > 0) normalizedAmounts[denom] = Math.floor(v)
    }
    if (Object.keys(normalizedAmounts).length === 0) {
      return res.status(400).json({ code: 'INVALID_INPUT', message: 'amounts must include at least one positive denomination' })
    }

    const role = await resolveCampaignRole(campaignId as UUID, user.userId as UUID)
    if (!role || role === 'SPECTATOR') {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Insufficient role' })
    }

    // Players may transfer from their own wallet to anywhere, or take from party to their own wallet.
    if (role === 'PLAYER') {
      const fromSelf = fromOwnerType === 'character' && fromOwnerId === user.userId
      const fromPartyToSelf =
        fromOwnerType === 'party' &&
        !fromOwnerId &&
        toOwnerType === 'character' &&
        toOwnerId === user.userId
      if (!fromSelf && !fromPartyToSelf) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Players can only transfer from their own wallet or take from party' })
      }
    }

    try {
      const session = await getActiveSession(campaignId as UUID)
      const result = await transferCurrency({
        campaignId: campaignId as UUID,
        fromOwnerType,
        fromOwnerId: fromOwnerId ?? null,
        toOwnerType,
        toOwnerId: toOwnerId ?? null,
        amounts: normalizedAmounts,
        actorUserId: user.userId as UUID,
        sessionId: session?.id as UUID | undefined,
      })

      if ('code' in result && result.code === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({
          code: 'INSUFFICIENT_FUNDS',
          message: 'Insufficient funds in source wallet',
          shortfall: result.shortfall,
        })
      }

      const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
      if (wsManager && 'fromWallet' in result) {
        const baseEvent = {
          version: 1 as const,
          userId: user.userId as UUID,
          userRole: role as any,
          sessionId: (session?.id ?? NO_SESSION_ID) as UUID,
          roomId: null,
        }
        // Debit event for source
        await wsManager.broadcastToCampaignMembers(campaignId as UUID, {
          ...baseEvent,
          id: crypto.randomUUID() as UUID,
          type: 'INVENTORY:CURRENCY_CHANGED' as const,
          timestamp: result.fromWallet.updatedAt,
          payload: {
            campaignId: campaignId as UUID,
            walletId: result.fromWallet.id,
            ownerType: result.fromWallet.ownerType,
            ownerId: result.fromWallet.ownerId,
            delta: Object.fromEntries(DENOMS.map((d) => [d, -(normalizedAmounts[d] ?? 0)])),
            newBalance: { cp: result.fromWallet.cp, sp: result.fromWallet.sp, ep: result.fromWallet.ep, gp: result.fromWallet.gp, pp: result.fromWallet.pp },
            changedByUserId: user.userId,
            changedAt: result.fromWallet.updatedAt,
          },
        })
        // Credit event for destination
        await wsManager.broadcastToCampaignMembers(campaignId as UUID, {
          ...baseEvent,
          id: crypto.randomUUID() as UUID,
          type: 'INVENTORY:CURRENCY_CHANGED' as const,
          timestamp: result.toWallet.updatedAt,
          payload: {
            campaignId: campaignId as UUID,
            walletId: result.toWallet.id,
            ownerType: result.toWallet.ownerType,
            ownerId: result.toWallet.ownerId,
            delta: normalizedAmounts,
            newBalance: { cp: result.toWallet.cp, sp: result.toWallet.sp, ep: result.toWallet.ep, gp: result.toWallet.gp, pp: result.toWallet.pp },
            changedByUserId: user.userId,
            changedAt: result.toWallet.updatedAt,
          },
        })
      }

      if (session && 'fromWallet' in result) {
        const parts = DENOMS.filter((d) => (normalizedAmounts[d] ?? 0) > 0)
          .map((d) => `${normalizedAmounts[d]}${d}`)
          .join(', ')
        const fromDesc = fromOwnerType === 'party' ? 'party purse' : 'character wallet'
        const toDesc = toOwnerType === 'party' ? 'party purse' : 'character wallet'
        await broadcastInventorySystemMessage({
          session,
          content: `[Inventory] ${parts} transferred from ${fromDesc} to ${toDesc}.`,
          actorUserId: user.userId as UUID,
          wsManager,
        })
      }

      return res.json('fromWallet' in result ? { fromWallet: result.fromWallet, toWallet: result.toWallet } : result)
    } catch (err) {
      logger.error('inventory.routes', 'Failed to transfer currency', { campaignId, err })
      return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to transfer currency' })
    }
  }
)


export default router
