/**
 * Integration Sync Policy Helpers
 * Layer 2 (inventory-specific) policy enforcement and conflict resolution for extension sync.
 * Reference: docs/extension/EXTENSION-INTEGRATION.md §5e, docs/subsystems/INVENTORY-SYSTEM.md §12.3
 */

import { InventoryItemCategory, Role } from '@shared'
import type { UUID, CurrencyWallet, EventEnvelope } from '@shared'
import { logger } from '@/utils'
import { randomUUID } from 'node:crypto'
import { getPrismaClient } from '@/infra/db'
import {
  syncExternalInventoryItems,
  setExternalCurrencyWallet,
  deleteExternalItemsNotInList,
  type ExternalInventoryItemInput,
  type InventoryItemDto,
  type CurrencyWalletDto,
} from '@/services/inventory/inventory.service'
import {
  queuePendingItemConflict,
  queuePendingCurrencyConflict,
} from '@/services/inventory/pending-extension-sync.service'
import eventBroadcaster from '@/ws/event-broadcaster'

const NO_SESSION_ID = '00000000-0000-4000-8000-000000000000' as UUID

const prisma = getPrismaClient()

const VALID_ITEM_CATEGORIES = ['EQUIPMENT', 'MAGIC_ITEM', 'HOMEBREW']
const DENOMINATIONS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const

export type ConflictResolution = 'OVERWRITE' | 'IGNORE' | 'PROMPT'

/**
 * Maps a raw item type field (as sent by DnD Beyond or similar) to our InventoryItemCategory.
 * "custom" items → HOMEBREW; magic-item rarities → MAGIC_ITEM; everything else → EQUIPMENT.
 */
function inferSrdCategory(it: Record<string, unknown>): InventoryItemCategory {
  if (
    typeof it.srdCategory === 'string' &&
    VALID_ITEM_CATEGORIES.includes(it.srdCategory as string)
  ) {
    return it.srdCategory as InventoryItemCategory
  }
  if (it.type === 'custom') return InventoryItemCategory.HOMEBREW
  if (
    typeof it.rarity === 'string' &&
    it.rarity !== '' &&
    it.rarity !== 'Common'
  ) {
    return InventoryItemCategory.MAGIC_ITEM
  }
  return InventoryItemCategory.EQUIPMENT
}

/** Validates and normalizes a raw `items` payload into safe `ExternalInventoryItemInput`s.
 *  Accepts both `externalId` (canonical) and `id` (DnD Beyond numeric id) as the external key. */
export function sanitizeExternalItems(items: unknown): ExternalInventoryItemInput[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((it): it is Record<string, unknown> => {
      if (!it || typeof it !== 'object') return false
      const obj = it as Record<string, unknown>
      const hasId = typeof obj.externalId === 'string' || obj.id !== undefined
      return hasId && typeof obj.name === 'string' && (obj.name as string).trim().length > 0
    })
    .map((it: any) => ({
      externalId:
        typeof it.externalId === 'string' && it.externalId.trim().length > 0
          ? it.externalId.trim()
          : String(it.id),
      name: String(it.name).trim(),
      quantity: Math.max(1, Number(it.quantity) || 1),
      srdKey: typeof it.srdKey === 'string' ? it.srdKey.trim() : undefined,
      srdCategory: inferSrdCategory(it),
      notes: typeof it.notes === 'string' && it.notes.trim().length > 0 ? it.notes.trim() : undefined,
    }))
}

/** Validates and clamps a raw currency wallet payload. Omitted denominations stay `undefined` (unchanged). */
export function sanitizeExternalWallet(wallet: Record<string, unknown>): Partial<CurrencyWallet> {
  return {
    cp: typeof wallet.cp === 'number' ? Math.max(0, wallet.cp) : undefined,
    sp: typeof wallet.sp === 'number' ? Math.max(0, wallet.sp) : undefined,
    ep: typeof wallet.ep === 'number' ? Math.max(0, wallet.ep) : undefined,
    gp: typeof wallet.gp === 'number' ? Math.max(0, wallet.gp) : undefined,
    pp: typeof wallet.pp === 'number' ? Math.max(0, wallet.pp) : undefined,
  }
}

async function broadcastInventoryItemEvent(params: {
  item: InventoryItemDto
  wasCreated: boolean
  actorUserId: UUID
  actorRole: Role
  sessionId: UUID
}): Promise<void> {
  if (!eventBroadcaster.isReady()) return
  const { item, wasCreated, actorUserId, actorRole, sessionId } = params
  const event: EventEnvelope = {
    id: randomUUID() as UUID,
    type: wasCreated ? 'INVENTORY:ITEM_ADDED' : 'INVENTORY:ITEM_EDITED',
    version: 1,
    userId: actorUserId,
    userRole: actorRole,
    sessionId,
    roomId: null,
    timestamp: wasCreated ? item.createdAt : item.updatedAt,
    payload: wasCreated
      ? {
          campaignId: item.campaignId,
          itemId: item.id,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          name: item.name,
          quantity: item.quantity,
          source: item.source,
          srdKey: item.srdKey ?? undefined,
          srdCategory: item.srdCategory,
          notes: item.notes ?? undefined,
          externalId: item.externalId ?? undefined,
          externalSource: item.externalSource ?? undefined,
          addedByUserId: item.addedByUserId,
          addedAt: item.createdAt,
        }
      : {
          campaignId: item.campaignId,
          itemId: item.id,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          name: item.name,
          quantity: item.quantity,
          notes: item.notes ?? undefined,
          editedByUserId: actorUserId,
          editedAt: item.updatedAt,
        },
  }
  try {
    await eventBroadcaster.broadcastToCampaignMembers(item.campaignId, event)
  } catch (err) {
    logger.warn('inventory-sync', 'Failed to broadcast inventory item event', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function broadcastInventoryRemovedEvent(params: {
  item: InventoryItemDto
  actorUserId: UUID
  actorRole: Role
  sessionId: UUID
}): Promise<void> {
  if (!eventBroadcaster.isReady()) return
  const { item, actorUserId, actorRole, sessionId } = params
  const now = Date.now()
  const event: EventEnvelope = {
    id: randomUUID() as UUID,
    type: 'INVENTORY:ITEM_REMOVED',
    version: 1,
    userId: actorUserId,
    userRole: actorRole,
    sessionId,
    roomId: null,
    timestamp: now,
    payload: {
      campaignId: item.campaignId,
      itemId: item.id,
      ownerType: item.ownerType,
      ownerId: item.ownerId,
      name: item.name,
      quantity: item.quantity,
      removedByUserId: actorUserId,
      removedAt: now,
    },
  }
  try {
    await eventBroadcaster.broadcastToCampaignMembers(item.campaignId, event)
  } catch (err) {
    logger.warn('inventory-sync', 'Failed to broadcast inventory removed event', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function broadcastCurrencyChangedEvent(params: {
  wallet: CurrencyWalletDto
  delta: Partial<CurrencyWallet>
  newBalance: CurrencyWallet
  actorUserId: UUID
  actorRole: Role
  sessionId: UUID
}): Promise<void> {
  if (!eventBroadcaster.isReady()) return
  const { wallet, delta, newBalance, actorUserId, actorRole, sessionId } = params
  const event: EventEnvelope = {
    id: randomUUID() as UUID,
    type: 'INVENTORY:CURRENCY_CHANGED',
    version: 1,
    userId: actorUserId,
    userRole: actorRole,
    sessionId,
    roomId: null,
    timestamp: wallet.updatedAt,
    payload: {
      campaignId: wallet.campaignId,
      walletId: wallet.id,
      ownerType: wallet.ownerType,
      ownerId: wallet.ownerId,
      delta,
      newBalance,
      changedByUserId: actorUserId,
      changedAt: wallet.updatedAt,
    },
  }
  try {
    await eventBroadcaster.broadcastToCampaignMembers(wallet.campaignId, event)
  } catch (err) {
    logger.warn('inventory-sync', 'Failed to broadcast currency changed event', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function notifyDmOfPendingSync(params: {
  dmUserId: UUID
  campaignId: UUID
  characterId: UUID
  pendingSyncId: UUID
  kind: 'ITEM' | 'CURRENCY'
  externalId: string
}): void {
  eventBroadcaster.sendToUser(params.dmUserId, {
    id: randomUUID() as UUID,
    type: 'INVENTORY:EXTENSION_SYNC_PENDING',
    version: 1,
    userId: params.dmUserId,
    userRole: Role.SYSTEM,
    sessionId: null as unknown as UUID,
    roomId: null,
    timestamp: Date.now(),
    payload: {
      campaignId: params.campaignId,
      characterId: params.characterId,
      pendingSyncId: params.pendingSyncId,
      kind: params.kind,
      externalId: params.externalId,
    },
  })
}

/**
 * Applies a batch of external items to a character's or the party's inventory, honoring the
 * campaign's conflict-resolution policy.
 *
 * - `OVERWRITE` (or no existing record): applied immediately.
 * - `IGNORE`: conflicting items are discarded; the existing record is left untouched.
 * - `PROMPT`: conflicting items queue for DM review when `characterIdForPending` is set. Party-owned
 *   conflicts (`characterIdForPending: null`) fall back to OVERWRITE — `PendingExtensionSync` is
 *   schema-locked to `characterId` (see docs/subsystems/INVENTORY-SYSTEM.md §2.3), so there is no
 *   DM-review queue shape for party records. Documented in docs/CONTRACTS.md.
 */
export async function applyItemsSection(params: {
  campaignId: UUID
  ownerId: UUID | null
  ownerType: 'character' | 'party'
  externalSource: string
  items: ExternalInventoryItemInput[]
  conflictResolution: ConflictResolution
  actorUserId: UUID
  sessionId?: UUID
  characterIdForPending: UUID | null
  dmUserId: UUID
}): Promise<{ upserted: number; pendingConflicts: number }> {
  if (params.items.length === 0) return { upserted: 0, pendingConflicts: 0 }

  const toApplyNow: ExternalInventoryItemInput[] = []
  let pendingConflicts = 0

  for (const item of params.items) {
    const existing = await prisma.inventoryItem.findFirst({
      where: {
        campaignId: params.campaignId,
        ownerId: params.ownerId,
        externalSource: params.externalSource,
        externalId: item.externalId,
      },
    })

    const isConflict =
      !!existing &&
      (existing.name !== item.name ||
        existing.quantity !== item.quantity ||
        existing.srdCategory !== item.srdCategory ||
        (existing.notes ?? undefined) !== item.notes)

    if (!isConflict || params.conflictResolution === 'OVERWRITE') {
      toApplyNow.push(item)
      continue
    }

    if (params.conflictResolution === 'IGNORE') {
      continue
    }

    // PROMPT
    if (params.characterIdForPending) {
      const pendingSyncId = await queuePendingItemConflict({
        campaignId: params.campaignId,
        characterId: params.characterIdForPending,
        externalSource: params.externalSource,
        externalId: item.externalId,
        incomingItem: item,
        existingSnapshot: existing as unknown as Record<string, unknown>,
      })
      notifyDmOfPendingSync({
        dmUserId: params.dmUserId,
        campaignId: params.campaignId,
        characterId: params.characterIdForPending,
        pendingSyncId,
        kind: 'ITEM',
        externalId: item.externalId,
      })
      pendingConflicts++
    } else {
      toApplyNow.push(item)
    }
  }

  if (toApplyNow.length === 0) return { upserted: 0, pendingConflicts }

  const result = await syncExternalInventoryItems({
    campaignId: params.campaignId,
    ownerId: params.ownerId,
    ownerType: params.ownerType,
    externalSource: params.externalSource,
    items: toApplyNow,
    actorUserId: params.actorUserId,
    sessionId: params.sessionId,
  })

  const actorRole = params.actorUserId === params.dmUserId ? Role.DM : Role.PLAYER
  const sessionId = params.sessionId ?? NO_SESSION_ID

  // Broadcast only items that actually changed content (skip no-op re-syncs)
  for (let i = 0; i < result.upserted.length; i++) {
    if (result.wasChanged[i]) {
      await broadcastInventoryItemEvent({
        item: result.upserted[i],
        wasCreated: result.wasCreated[i],
        actorUserId: params.actorUserId,
        actorRole,
        sessionId,
      })
    }
  }

  // Replace semantics for character-owned syncs: remove items from this source that
  // are no longer in the incoming list. Party inventory uses merge semantics.
  // Use the full params.items list (not toApplyNow) so PROMPT-queued items are not deleted.
  if (params.ownerType === 'character') {
    const incomingIds = params.items.map((it) => it.externalId)
    const removed = await deleteExternalItemsNotInList({
      campaignId: params.campaignId,
      ownerId: params.ownerId,
      ownerType: 'character',
      externalSource: params.externalSource,
      keepExternalIds: incomingIds,
      actorUserId: params.actorUserId,
      sessionId: params.sessionId,
    })
    for (const { item } of removed) {
      await broadcastInventoryRemovedEvent({ item, actorUserId: params.actorUserId, actorRole, sessionId })
    }
  }

  return { upserted: result.upserted.length, pendingConflicts }
}

/**
 * Applies a currency wallet update, honoring the campaign's conflict-resolution policy.
 * A "conflict" is an existing non-zero balance in any denomination present in the incoming wallet.
 * See `applyItemsSection` doc comment for the PROMPT/party fallback rule.
 */
export async function applyCurrencySection(params: {
  campaignId: UUID
  ownerId: UUID | null
  ownerType: 'character' | 'party'
  externalSource: string
  wallet: Partial<CurrencyWallet>
  conflictResolution: ConflictResolution
  actorUserId: UUID
  sessionId?: UUID
  characterIdForPending: UUID | null
  dmUserId: UUID
}): Promise<{ updated: boolean; pendingConflicts: number }> {
  const existing = await prisma.currencyWallet.findFirst({
    where: { campaignId: params.campaignId, ownerType: params.ownerType, ownerId: params.ownerId },
  })

  const isConflict = Boolean(
    existing && DENOMINATIONS.some((denom) => typeof params.wallet[denom] === 'number' && existing[denom] !== 0)
  )

  const existingBalance = {
    cp: existing?.cp ?? 0,
    sp: existing?.sp ?? 0,
    ep: existing?.ep ?? 0,
    gp: existing?.gp ?? 0,
    pp: existing?.pp ?? 0,
  }

  const newBalance: CurrencyWallet = {
    cp: params.wallet.cp ?? existingBalance.cp,
    sp: params.wallet.sp ?? existingBalance.sp,
    ep: params.wallet.ep ?? existingBalance.ep,
    gp: params.wallet.gp ?? existingBalance.gp,
    pp: params.wallet.pp ?? existingBalance.pp,
  }

  const delta: Partial<CurrencyWallet> = {
    cp: newBalance.cp - existingBalance.cp,
    sp: newBalance.sp - existingBalance.sp,
    ep: newBalance.ep - existingBalance.ep,
    gp: newBalance.gp - existingBalance.gp,
    pp: newBalance.pp - existingBalance.pp,
  }

  const apply = () =>
    setExternalCurrencyWallet({
      campaignId: params.campaignId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      wallet: params.wallet,
      actorUserId: params.actorUserId,
      sessionId: params.sessionId,
    })

  const actorRole = params.actorUserId === params.dmUserId ? Role.DM : Role.PLAYER
  const sessionId = params.sessionId ?? NO_SESSION_ID

  if (!isConflict || params.conflictResolution === 'OVERWRITE') {
    const wallet = await apply()
    await broadcastCurrencyChangedEvent({ wallet, delta, newBalance, actorUserId: params.actorUserId, actorRole, sessionId })
    return { updated: true, pendingConflicts: 0 }
  }

  if (params.conflictResolution === 'IGNORE') {
    return { updated: false, pendingConflicts: 0 }
  }

  // PROMPT
  if (params.characterIdForPending) {
    const pendingSyncId = await queuePendingCurrencyConflict({
      campaignId: params.campaignId,
      characterId: params.characterIdForPending,
      externalSource: params.externalSource,
      incomingWallet: params.wallet,
      existingSnapshot: (existing as unknown as Record<string, unknown>) ?? {},
    })
    notifyDmOfPendingSync({
      dmUserId: params.dmUserId,
      campaignId: params.campaignId,
      characterId: params.characterIdForPending,
      pendingSyncId,
      kind: 'CURRENCY',
      externalId: 'currency',
    })
    return { updated: false, pendingConflicts: 1 }
  }

  const wallet = await apply()
  await broadcastCurrencyChangedEvent({ wallet, delta, newBalance, actorUserId: params.actorUserId, actorRole, sessionId })
  return { updated: true, pendingConflicts: 0 }
}
