/**
 * Integration Sync Policy Helpers
 * Layer 2 (inventory-specific) policy enforcement and conflict resolution for extension sync.
 * Reference: docs/extension/EXTENSION-INTEGRATION.md §5e, docs/subsystems/INVENTORY-SYSTEM.md §12.3
 */

import { InventoryItemCategory, Role } from '@shared'
import type { UUID, CurrencyWallet } from '@shared'
import { randomUUID } from 'node:crypto'
import { getPrismaClient } from '@/infra/db'
import {
  syncExternalInventoryItems,
  setExternalCurrencyWallet,
  type ExternalInventoryItemInput,
} from '@/services/inventory/inventory.service'
import {
  queuePendingItemConflict,
  queuePendingCurrencyConflict,
} from '@/services/inventory/pending-extension-sync.service'
import eventBroadcaster from '@/ws/event-broadcaster'

const prisma = getPrismaClient()

const VALID_ITEM_CATEGORIES = ['EQUIPMENT', 'MAGIC_ITEM', 'HOMEBREW']
const DENOMINATIONS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const

export type ConflictResolution = 'OVERWRITE' | 'IGNORE' | 'PROMPT'

/** Validates and normalizes a raw `items` payload into safe `ExternalInventoryItemInput`s. */
export function sanitizeExternalItems(items: unknown): ExternalInventoryItemInput[] {
  if (!Array.isArray(items)) return []
  return items
    .filter(
      (it): it is Record<string, unknown> =>
        Boolean(it) && typeof (it as any).externalId === 'string' && typeof (it as any).name === 'string'
    )
    .map((it: any) => ({
      externalId: String(it.externalId).trim(),
      name: String(it.name).trim(),
      quantity: Math.max(1, Number(it.quantity) || 1),
      srdKey: typeof it.srdKey === 'string' ? it.srdKey.trim() : undefined,
      srdCategory:
        typeof it.srdCategory === 'string' && VALID_ITEM_CATEGORIES.includes(it.srdCategory)
          ? (it.srdCategory as InventoryItemCategory)
          : InventoryItemCategory.EQUIPMENT,
      notes: typeof it.notes === 'string' ? it.notes.trim() : undefined,
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

  const apply = () =>
    setExternalCurrencyWallet({
      campaignId: params.campaignId,
      ownerId: params.ownerId,
      ownerType: params.ownerType,
      wallet: params.wallet,
      actorUserId: params.actorUserId,
      sessionId: params.sessionId,
    })

  if (!isConflict || params.conflictResolution === 'OVERWRITE') {
    await apply()
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

  await apply()
  return { updated: true, pendingConflicts: 0 }
}
