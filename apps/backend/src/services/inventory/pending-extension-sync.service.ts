/**
 * Pending Extension Sync Service
 * Manages the DM-review queue for extension sync conflicts under the campaign's
 * `extensionSyncConflictResolution: 'PROMPT'` policy.
 * Reference: docs/subsystems/INVENTORY-SYSTEM.md §2.3, §12.3 / docs/extension/EXTENSION-INTEGRATION.md §5e
 */

import { randomUUID } from 'node:crypto'
import type { UUID, CurrencyWallet } from '@shared'
import {
  createPendingExtensionSyncRecord,
  listPendingExtensionSyncs,
  findPendingExtensionSyncById,
  deletePendingExtensionSyncRecord,
  type PendingExtensionSyncRow,
} from '@/repositories/pending-extension-sync.repository'
import {
  syncExternalInventoryItems,
  setExternalCurrencyWallet,
  type ExternalInventoryItemInput,
  type InventoryItemDto,
  type CurrencyWalletDto,
} from '@/services/inventory/inventory.service'

export interface PendingExtensionSyncDto {
  id: UUID
  campaignId: UUID
  characterId: UUID
  externalSource: string
  externalId: string
  kind: 'ITEM' | 'CURRENCY'
  incomingPayload: unknown
  existingSnapshot: unknown
  createdAt: number
  expiresAt: number
}

function mapRow(row: PendingExtensionSyncRow): PendingExtensionSyncDto {
  return {
    id: row.id as UUID,
    campaignId: row.campaignId as UUID,
    characterId: row.characterId as UUID,
    externalSource: row.externalSource,
    externalId: row.externalId,
    kind: row.kind,
    incomingPayload: row.incomingPayload,
    existingSnapshot: row.existingSnapshot,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
  }
}

/** Queues a conflicting item update for DM review. Returns the new pending sync's id. */
export async function queuePendingItemConflict(params: {
  campaignId: UUID
  characterId: UUID
  externalSource: string
  externalId: string
  incomingItem: ExternalInventoryItemInput
  existingSnapshot: Record<string, unknown>
}): Promise<UUID> {
  const row = await createPendingExtensionSyncRecord({
    id: randomUUID(),
    campaignId: params.campaignId,
    characterId: params.characterId,
    externalSource: params.externalSource,
    externalId: params.externalId,
    kind: 'ITEM',
    incomingPayload: params.incomingItem,
    existingSnapshot: params.existingSnapshot,
    now: new Date(),
  })
  return row.id as UUID
}

/** Queues a conflicting currency wallet update for DM review. Returns the new pending sync's id. */
export async function queuePendingCurrencyConflict(params: {
  campaignId: UUID
  characterId: UUID
  externalSource: string
  incomingWallet: Partial<CurrencyWallet>
  existingSnapshot: Record<string, unknown>
}): Promise<UUID> {
  const row = await createPendingExtensionSyncRecord({
    id: randomUUID(),
    campaignId: params.campaignId,
    characterId: params.characterId,
    externalSource: params.externalSource,
    externalId: 'currency',
    kind: 'CURRENCY',
    incomingPayload: params.incomingWallet,
    existingSnapshot: params.existingSnapshot,
    now: new Date(),
  })
  return row.id as UUID
}

export async function listPendingSyncsForCampaign(campaignId: UUID): Promise<PendingExtensionSyncDto[]> {
  const rows = await listPendingExtensionSyncs(campaignId)
  return rows.map(mapRow)
}

export type ApprovePendingSyncResult =
  | { ok: true; kind: 'ITEM'; item: InventoryItemDto; created: boolean }
  | { ok: true; kind: 'CURRENCY'; wallet: CurrencyWalletDto }
  | { ok: false; code: 'NOT_FOUND' }

/**
 * Applies a pending sync change via the standard 4-layer inventory mutation contract
 * (the same functions used for OVERWRITE-mode sync and manual edits), then deletes the
 * pending record. The caller (route) is responsible for broadcasting the resulting
 * INVENTORY:ITEM_ADDED / INVENTORY:ITEM_EDITED / INVENTORY:CURRENCY_CHANGED event —
 * this service does not touch WS, matching the existing inventory.routes.ts pattern.
 */
export async function approvePendingSync(params: {
  pendingId: UUID
  campaignId: UUID
  actorUserId: UUID
  sessionId?: UUID
}): Promise<ApprovePendingSyncResult> {
  const row = await findPendingExtensionSyncById(params.pendingId, params.campaignId)
  if (!row) return { ok: false, code: 'NOT_FOUND' }

  if (row.kind === 'ITEM') {
    const incoming = row.incomingPayload as ExternalInventoryItemInput
    const result = await syncExternalInventoryItems({
      campaignId: params.campaignId,
      ownerId: row.characterId as UUID,
      externalSource: row.externalSource,
      items: [incoming],
      actorUserId: params.actorUserId,
      sessionId: params.sessionId,
    })
    await deletePendingExtensionSyncRecord(row.id)
    return { ok: true, kind: 'ITEM', item: result.upserted[0], created: result.created > 0 }
  }

  const incomingWallet = row.incomingPayload as Partial<CurrencyWallet>
  const wallet = await setExternalCurrencyWallet({
    campaignId: params.campaignId,
    ownerId: row.characterId as UUID,
    wallet: incomingWallet,
    actorUserId: params.actorUserId,
    sessionId: params.sessionId,
  })
  await deletePendingExtensionSyncRecord(row.id)
  return { ok: true, kind: 'CURRENCY', wallet }
}

/** Discards a pending sync without applying it. Returns false if not found (or already expired). */
export async function rejectPendingSync(params: { pendingId: UUID; campaignId: UUID }): Promise<boolean> {
  const row = await findPendingExtensionSyncById(params.pendingId, params.campaignId)
  if (!row) return false
  await deletePendingExtensionSyncRecord(row.id)
  return true
}
