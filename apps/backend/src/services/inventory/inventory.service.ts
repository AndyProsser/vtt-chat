/**
 * Inventory Service
 * All campaign-scoped inventory mutations: items and currency wallets.
 * Every mutating function returns enough data for the caller to build the WS EventEnvelope.
 */

import { randomUUID } from 'node:crypto'
import { InventoryItemSource, InventoryItemCategory, InventoryActionType } from '@shared'
import type { UUID, CurrencyWallet } from '@shared'
import {
  createInventoryItemRecord,
  updateInventoryItemRecord,
  deleteInventoryItemRecord,
  transferInventoryItemRecord,
  findInventoryItemById,
  listCampaignInventoryItems,
  findOrCreateCurrencyWallet,
  updateCurrencyWalletRecord,
  listCampaignCurrencyWallets,
  createInventoryHistoryRecord,
  listInventoryHistory,
  upsertExternalInventoryItem,
  deleteStaleExternalItems,
  type InventoryItemRow,
  type CurrencyWalletRow,
  type InventoryHistoryRow,
} from '@/repositories/inventory.repository'
import { getCampaignDmId } from '@/repositories/campaign.repository'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InventoryItemDto {
  id: UUID
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
  quantity: number
  source: InventoryItemSource
  srdKey: string | null
  srdCategory: InventoryItemCategory
  notes: string | null
  externalId: string | null
  externalSource: string | null
  addedByUserId: UUID
  createdAt: number
  updatedAt: number
}

export interface CurrencyWalletDto {
  id: UUID
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
  updatedAt: number
}

function mapItem(row: InventoryItemRow): InventoryItemDto {
  return {
    id: row.id as UUID,
    campaignId: row.campaignId as UUID,
    ownerType: row.ownerType as 'party' | 'character',
    ownerId: (row.ownerId as UUID) ?? null,
    name: row.name,
    quantity: row.quantity,
    source: row.source as InventoryItemSource,
    srdKey: row.srdKey,
    srdCategory: row.srdCategory as InventoryItemCategory,
    notes: row.notes,
    externalId: row.externalId,
    externalSource: row.externalSource,
    addedByUserId: row.addedByUserId as UUID,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function mapWallet(row: CurrencyWalletRow): CurrencyWalletDto {
  return {
    id: row.id as UUID,
    campaignId: row.campaignId as UUID,
    ownerType: row.ownerType as 'party' | 'character',
    ownerId: (row.ownerId as UUID) ?? null,
    cp: row.cp,
    sp: row.sp,
    ep: row.ep,
    gp: row.gp,
    pp: row.pp,
    updatedAt: row.updatedAt.getTime(),
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getCampaignInventory(campaignId: UUID): Promise<{
  items: InventoryItemDto[]
  wallets: CurrencyWalletDto[]
}> {
  const [items, wallets] = await Promise.all([
    listCampaignInventoryItems(campaignId),
    listCampaignCurrencyWallets(campaignId),
  ])
  return { items: items.map(mapItem), wallets: wallets.map(mapWallet) }
}

export interface InventoryHistoryDto {
  id: string
  campaignId: string
  itemId: string | null
  sessionId: string | null
  actorUserId: string
  actorName: string
  actionType: string
  fromOwnerType: string | null
  fromOwnerId: string | null
  fromOwnerName: string | null
  toOwnerType: string | null
  toOwnerId: string | null
  toOwnerName: string | null
  quantity: number | null
  currencyDelta: unknown
  itemName: string | null
  notes: string | null
  createdAt: number
}

export async function getInventoryHistory(
  campaignId: UUID,
  limit = 50,
  offset = 0,
  filters?: {
    ownerType?: 'party' | 'character'
    ownerId?: string | null
    dateFrom?: Date
    dateTo?: Date
    viewerUserId?: string
  }
): Promise<InventoryHistoryDto[]> {
  const [rows, dmId] = await Promise.all([
    listInventoryHistory({ campaignId, limit, offset, ...filters }),
    getCampaignDmId(campaignId),
  ])

  // Collect unique user IDs that need name resolution
  const userIds = new Set<string>()
  for (const row of rows) {
    userIds.add(row.actorUserId)
    if (row.fromOwnerId && row.fromOwnerType === 'character') userIds.add(row.fromOwnerId)
    if (row.toOwnerId && row.toOwnerType === 'character') userIds.add(row.toOwnerId)
  }
  const userIdList = [...userIds]

  const [users, characters] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIdList } },
      select: { id: true, displayName: true },
    }),
    prisma.character.findMany({
      where: { campaignId, userId: { in: userIdList }, isActive: true },
      select: { userId: true, name: true },
    }),
  ])

  const displayNameMap = new Map(users.map((u) => [u.id, u.displayName]))
  // Character name takes precedence over display name
  const characterNameMap = new Map(characters.map((c) => [c.userId, c.name]))

  function resolveName(userId: string): string {
    if (userId === dmId) return 'DM'
    return characterNameMap.get(userId) ?? displayNameMap.get(userId) ?? 'Unknown'
  }

  function resolveOwnerName(ownerType: string | null, ownerId: string | null): string | null {
    if (!ownerType) return null
    if (ownerType === 'party') return 'Party'
    if (ownerId) return characterNameMap.get(ownerId) ?? displayNameMap.get(ownerId) ?? 'Unknown'
    return null
  }

  return rows.map((row) => ({
    ...row,
    actorName: resolveName(row.actorUserId),
    fromOwnerName: resolveOwnerName(row.fromOwnerType, row.fromOwnerId),
    toOwnerName: resolveOwnerName(row.toOwnerType, row.toOwnerId),
    createdAt: row.createdAt.getTime(),
  }))
}

// ─── Item mutations ───────────────────────────────────────────────────────────

export async function addInventoryItem(params: {
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
  quantity: number
  source?: InventoryItemSource
  srdKey?: string
  srdCategory?: InventoryItemCategory
  notes?: string
  externalId?: string
  externalSource?: string
  addedByUserId: UUID
  sessionId?: UUID
}): Promise<InventoryItemDto> {
  const now = new Date()
  const id = randomUUID() as UUID
  const row = await createInventoryItemRecord({
    id,
    campaignId: params.campaignId,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    name: params.name,
    quantity: params.quantity,
    source: params.source ?? InventoryItemSource.CUSTOM,
    srdKey: params.srdKey ?? null,
    srdCategory: params.srdCategory ?? InventoryItemCategory.EQUIPMENT,
    notes: params.notes ?? null,
    externalId: params.externalId ?? null,
    externalSource: params.externalSource ?? null,
    addedByUserId: params.addedByUserId,
    createdAt: now,
    updatedAt: now,
  })

  await createInventoryHistoryRecord({
    id: randomUUID() as UUID,
    campaignId: params.campaignId,
    itemId: id,
    sessionId: params.sessionId ?? null,
    actorUserId: params.addedByUserId,
    actionType: InventoryActionType.ITEM_ADDED,
    fromOwnerType: null,
    fromOwnerId: null,
    toOwnerType: params.ownerType,
    toOwnerId: params.ownerId,
    quantity: params.quantity,
    currencyDelta: null,
    itemName: params.name,
    notes: params.notes ?? null,
    createdAt: now,
  })

  return mapItem(row)
}

export async function editInventoryItem(params: {
  itemId: UUID
  campaignId: UUID
  name?: string
  quantity?: number
  notes?: string | null
  actorUserId: UUID
  sessionId?: UUID
}): Promise<InventoryItemDto> {
  const row = await updateInventoryItemRecord({
    id: params.itemId,
    name: params.name,
    quantity: params.quantity,
    notes: params.notes,
    updatedAt: new Date(),
  })

  await createInventoryHistoryRecord({
    id: randomUUID() as UUID,
    campaignId: params.campaignId,
    itemId: params.itemId,
    sessionId: params.sessionId ?? null,
    actorUserId: params.actorUserId,
    actionType: InventoryActionType.ITEM_EDITED,
    fromOwnerType: null,
    fromOwnerId: null,
    toOwnerType: null,
    toOwnerId: null,
    quantity: params.quantity ?? null,
    currencyDelta: null,
    itemName: params.name ?? row.name,
    notes: params.notes ?? null,
    createdAt: new Date(),
  })

  return mapItem(row)
}

export async function removeInventoryItem(params: {
  itemId: UUID
  campaignId: UUID
  actorUserId: UUID
  sessionId?: UUID
}): Promise<InventoryItemDto> {
  const existing = await findInventoryItemById(params.itemId)
  if (!existing || existing.campaignId !== params.campaignId) {
    throw new Error('Item not found in this campaign')
  }

  await createInventoryHistoryRecord({
    id: randomUUID() as UUID,
    campaignId: params.campaignId,
    itemId: params.itemId,
    sessionId: params.sessionId ?? null,
    actorUserId: params.actorUserId,
    actionType: InventoryActionType.ITEM_REMOVED,
    fromOwnerType: existing.ownerType,
    fromOwnerId: existing.ownerId,
    toOwnerType: null,
    toOwnerId: null,
    quantity: existing.quantity,
    currencyDelta: null,
    itemName: existing.name,
    notes: null,
    createdAt: new Date(),
  })

  await deleteInventoryItemRecord(params.itemId)
  return mapItem(existing)
}

export async function transferInventoryItem(params: {
  itemId: UUID
  campaignId: UUID
  toOwnerType: 'party' | 'character'
  toOwnerId: UUID | null
  actorUserId: UUID
  sessionId?: UUID
}): Promise<InventoryItemDto> {
  const existing = await findInventoryItemById(params.itemId)
  if (!existing || existing.campaignId !== params.campaignId) {
    throw new Error('Item not found in this campaign')
  }

  const now = new Date()
  const row = await transferInventoryItemRecord({
    id: params.itemId,
    toOwnerType: params.toOwnerType,
    toOwnerId: params.toOwnerId,
    updatedAt: now,
  })

  await createInventoryHistoryRecord({
    id: randomUUID() as UUID,
    campaignId: params.campaignId,
    itemId: params.itemId,
    sessionId: params.sessionId ?? null,
    actorUserId: params.actorUserId,
    actionType: InventoryActionType.ITEM_TRANSFERRED,
    fromOwnerType: existing.ownerType,
    fromOwnerId: existing.ownerId,
    toOwnerType: params.toOwnerType,
    toOwnerId: params.toOwnerId,
    quantity: existing.quantity,
    currencyDelta: null,
    itemName: existing.name,
    notes: null,
    createdAt: now,
  })

  return mapItem(row)
}

// ─── Currency mutations ───────────────────────────────────────────────────────

export async function adjustCurrency(params: {
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  delta: Partial<CurrencyWallet>
  actorUserId: UUID
  sessionId?: UUID
}): Promise<CurrencyWalletDto> {
  const wallet = await findOrCreateCurrencyWallet({
    campaignId: params.campaignId,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
  })

  const newBalance: CurrencyWallet = {
    cp: Math.max(0, wallet.cp + (params.delta.cp ?? 0)),
    sp: Math.max(0, wallet.sp + (params.delta.sp ?? 0)),
    ep: Math.max(0, wallet.ep + (params.delta.ep ?? 0)),
    gp: Math.max(0, wallet.gp + (params.delta.gp ?? 0)),
    pp: Math.max(0, wallet.pp + (params.delta.pp ?? 0)),
  }

  const now = new Date()
  const updated = await updateCurrencyWalletRecord({
    id: wallet.id,
    ...newBalance,
    updatedAt: now,
  })

  await createInventoryHistoryRecord({
    id: randomUUID() as UUID,
    campaignId: params.campaignId,
    itemId: null,
    sessionId: params.sessionId ?? null,
    actorUserId: params.actorUserId,
    actionType: InventoryActionType.CURRENCY_CHANGED,
    fromOwnerType: null,
    fromOwnerId: null,
    toOwnerType: null,
    toOwnerId: null,
    quantity: null,
    currencyDelta: params.delta,
    itemName: null,
    notes: null,
    createdAt: now,
  })

  return mapWallet(updated)
}

// ─── Item name lookup ────────────────────────────────────────────────────────

/**
 * Find the first item owned by the given owner whose name matches (case-insensitive).
 * Used by chat commands to resolve an item by name instead of ID.
 */
export async function findItemByOwnerAndName(params: {
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
}): Promise<InventoryItemDto | null> {
  const rows = await listCampaignInventoryItems(params.campaignId)
  const needle = params.name.trim().toLowerCase()
  const match = rows.find(
    (r) =>
      r.ownerType === params.ownerType &&
      (params.ownerType === 'party' ? r.ownerId === null : r.ownerId === params.ownerId) &&
      r.name.toLowerCase() === needle
  )
  return match ? mapItem(match) : null
}

/**
 * Add qty to party/character inventory, stacking onto an existing item with the
 * same name (case-insensitive) if one already exists for the same owner.
 * Returns the resulting item and a flag indicating whether it was a stack increment.
 */
export async function addOrStackInventoryItem(params: {
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
  quantity: number
  source?: InventoryItemSource
  srdKey?: string
  srdCategory?: InventoryItemCategory
  notes?: string
  addedByUserId: UUID
  sessionId?: UUID
}): Promise<{ item: InventoryItemDto; wasStacked: boolean }> {
  const existing = await findItemByOwnerAndName({
    campaignId: params.campaignId,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    name: params.name,
  })

  if (existing) {
    const updated = await editInventoryItem({
      itemId: existing.id,
      campaignId: params.campaignId,
      quantity: existing.quantity + params.quantity,
      actorUserId: params.addedByUserId,
      sessionId: params.sessionId,
    })
    return { item: updated, wasStacked: true }
  }

  const item = await addInventoryItem(params)
  return { item, wasStacked: false }
}

/**
 * Transfer `qty` of an item to a new owner.
 * If qty equals the item's full quantity, the item is moved whole.
 * If qty is less, the source item is decremented and a new item is created for the target.
 * Both paths write history entries.
 */
export async function partialTransferInventoryItem(params: {
  item: InventoryItemDto
  qty: number
  campaignId: UUID
  toOwnerType: 'party' | 'character'
  toOwnerId: UUID | null
  actorUserId: UUID
  sessionId?: UUID
}): Promise<InventoryItemDto> {
  const { item, qty } = params

  if (qty === item.quantity) {
    return transferInventoryItem({
      itemId: item.id,
      campaignId: params.campaignId,
      toOwnerType: params.toOwnerType,
      toOwnerId: params.toOwnerId,
      actorUserId: params.actorUserId,
      sessionId: params.sessionId,
    })
  }

  // Partial: decrement source, create new item for target
  await editInventoryItem({
    itemId: item.id,
    campaignId: params.campaignId,
    quantity: item.quantity - qty,
    actorUserId: params.actorUserId,
    sessionId: params.sessionId,
  })

  const newItem = await addInventoryItem({
    campaignId: params.campaignId,
    ownerType: params.toOwnerType,
    ownerId: params.toOwnerId,
    name: item.name,
    quantity: qty,
    source: item.source,
    srdKey: item.srdKey ?? undefined,
    srdCategory: item.srdCategory,
    notes: item.notes ?? undefined,
    addedByUserId: params.actorUserId,
    sessionId: params.sessionId,
  })

  return newItem
}

/**
 * Remove `qty` of an item. If qty equals full quantity, the item is deleted.
 * If qty is less, the item's quantity is decremented.
 */
export async function partialRemoveInventoryItem(params: {
  item: InventoryItemDto
  qty: number
  campaignId: UUID
  actorUserId: UUID
  sessionId?: UUID
}): Promise<InventoryItemDto> {
  const { item, qty } = params

  if (qty === item.quantity) {
    return removeInventoryItem({
      itemId: item.id,
      campaignId: params.campaignId,
      actorUserId: params.actorUserId,
      sessionId: params.sessionId,
    })
  }

  return editInventoryItem({
    itemId: item.id,
    campaignId: params.campaignId,
    quantity: item.quantity - qty,
    actorUserId: params.actorUserId,
    sessionId: params.sessionId,
  })
}

// ─── Atomic currency transfer ────────────────────────────────────────────────

export type CurrencyDenomination = 'cp' | 'sp' | 'ep' | 'gp' | 'pp'

export interface CurrencyTransferResult {
  fromWallet: CurrencyWalletDto
  toWallet: CurrencyWalletDto
}

export interface InsufficientFundsError {
  code: 'INSUFFICIENT_FUNDS'
  /** Denominations that have a shortfall, keyed by coin type. */
  shortfall: Partial<Record<CurrencyDenomination, number>>
}

/**
 * Atomically debit fromWallet and credit toWallet for the given amounts.
 * Returns INSUFFICIENT_FUNDS if the source wallet can't cover any denomination.
 * All writes run in a single Prisma transaction.
 */
export async function transferCurrency(params: {
  campaignId: UUID
  fromOwnerType: 'party' | 'character'
  fromOwnerId: UUID | null
  toOwnerType: 'party' | 'character'
  toOwnerId: UUID | null
  amounts: Partial<Record<CurrencyDenomination, number>>
  actorUserId: UUID
  sessionId?: UUID
}): Promise<CurrencyTransferResult | InsufficientFundsError> {
  const DENOMS: CurrencyDenomination[] = ['cp', 'sp', 'ep', 'gp', 'pp']

  const [fromRow, toRow] = await Promise.all([
    findOrCreateCurrencyWallet({
      campaignId: params.campaignId,
      ownerType: params.fromOwnerType,
      ownerId: params.fromOwnerId,
    }),
    findOrCreateCurrencyWallet({
      campaignId: params.campaignId,
      ownerType: params.toOwnerType,
      ownerId: params.toOwnerId,
    }),
  ])

  // Validate sufficient funds
  const shortfall: Partial<Record<CurrencyDenomination, number>> = {}
  for (const denom of DENOMS) {
    const amount = params.amounts[denom] ?? 0
    if (amount > 0 && fromRow[denom] < amount) {
      shortfall[denom] = amount - fromRow[denom]
    }
  }
  if (Object.keys(shortfall).length > 0) {
    return { code: 'INSUFFICIENT_FUNDS', shortfall }
  }

  const now = new Date()

  // Apply debit and credit
  const fromBalance = {
    cp: fromRow.cp - (params.amounts.cp ?? 0),
    sp: fromRow.sp - (params.amounts.sp ?? 0),
    ep: fromRow.ep - (params.amounts.ep ?? 0),
    gp: fromRow.gp - (params.amounts.gp ?? 0),
    pp: fromRow.pp - (params.amounts.pp ?? 0),
  }
  const toBalance = {
    cp: toRow.cp + (params.amounts.cp ?? 0),
    sp: toRow.sp + (params.amounts.sp ?? 0),
    ep: toRow.ep + (params.amounts.ep ?? 0),
    gp: toRow.gp + (params.amounts.gp ?? 0),
    pp: toRow.pp + (params.amounts.pp ?? 0),
  }

  const [updatedFrom, updatedTo] = await prisma.$transaction([
    prisma.currencyWallet.update({ where: { id: fromRow.id }, data: { ...fromBalance, updatedAt: now } }),
    prisma.currencyWallet.update({ where: { id: toRow.id }, data: { ...toBalance, updatedAt: now } }),
  ])

  const historyBase = {
    campaignId: params.campaignId,
    sessionId: params.sessionId ?? null,
    actorUserId: params.actorUserId,
    actionType: InventoryActionType.CURRENCY_CHANGED,
    itemId: null,
    itemName: null,
    quantity: null,
    currencyDelta: params.amounts,
    notes: null,
  }

  await Promise.all([
    createInventoryHistoryRecord({
      id: randomUUID() as UUID,
      ...historyBase,
      fromOwnerType: params.fromOwnerType,
      fromOwnerId: params.fromOwnerId,
      toOwnerType: params.toOwnerType,
      toOwnerId: params.toOwnerId,
      createdAt: now,
    }),
  ])

  return {
    fromWallet: mapWallet(updatedFrom as CurrencyWalletRow),
    toWallet: mapWallet(updatedTo as CurrencyWalletRow),
  }
}

// ─── External sync ────────────────────────────────────────────────────────────

export interface ExternalInventoryItemInput {
  externalId: string
  name: string
  quantity: number
  srdKey?: string
  srdCategory?: InventoryItemCategory
  notes?: string
}

export interface ExternalInventorySyncResult {
  upserted: InventoryItemDto[]
  /** Parallel to `upserted` — true if the item at the same index was newly created. */
  wasCreated: boolean[]
  /** Parallel to `upserted` — false when the update left all content fields identical (no-op). */
  wasChanged: boolean[]
  created: number
  updated: number
}

/**
 * Upserts a batch of external items into a character's inventory.
 * Items are matched by (campaignId, ownerId, externalSource, externalId).
 * Existing items are updated in-place; new items are created with source=EXTERNAL.
 * Items not in the list are left untouched (merge semantics, not replace).
 */
export async function syncExternalInventoryItems(params: {
  campaignId: UUID
  ownerId: UUID | null
  /** Defaults to 'character' — pass 'party' for party-targeted extension sync (ownerId null). */
  ownerType?: 'character' | 'party'
  externalSource: string
  items: ExternalInventoryItemInput[]
  actorUserId: UUID
  sessionId?: UUID
}): Promise<ExternalInventorySyncResult> {
  const ownerType = params.ownerType ?? 'character'
  const now = new Date()
  const results: InventoryItemDto[] = []
  const createdFlags: boolean[] = []
  const changedFlags: boolean[] = []
  let created = 0
  let updated = 0

  for (const item of params.items) {
    const { row, created: wasCreated, changed: wasChanged } = await upsertExternalInventoryItem({
      campaignId: params.campaignId,
      ownerId: params.ownerId,
      ownerType,
      externalSource: params.externalSource,
      externalId: item.externalId,
      name: item.name,
      quantity: item.quantity,
      srdKey: item.srdKey ?? null,
      srdCategory: item.srdCategory ?? InventoryItemCategory.EQUIPMENT,
      notes: item.notes ?? null,
      addedByUserId: params.actorUserId,
      now,
    })

    // Only write history when content actually changed — skip no-op re-syncs
    if (wasChanged) {
      await createInventoryHistoryRecord({
        id: randomUUID() as UUID,
        campaignId: params.campaignId,
        itemId: row.id,
        sessionId: params.sessionId ?? null,
        actorUserId: params.actorUserId,
        actionType: wasCreated ? InventoryActionType.ITEM_ADDED : InventoryActionType.ITEM_EDITED,
        fromOwnerType: wasCreated ? null : ownerType,
        fromOwnerId: wasCreated ? null : params.ownerId,
        toOwnerType: ownerType,
        toOwnerId: params.ownerId,
        quantity: item.quantity,
        currencyDelta: null,
        itemName: item.name,
        notes: item.notes ?? null,
        createdAt: now,
      })
    }

    results.push(mapItem(row))
    createdFlags.push(wasCreated)
    changedFlags.push(wasChanged)
    if (wasCreated) created++
    else if (wasChanged) updated++
  }

  return { upserted: results, wasCreated: createdFlags, wasChanged: changedFlags, created, updated }
}

export interface DeletedExternalItemResult {
  item: InventoryItemDto
}

/**
 * Deletes all items for the given owner+source that are NOT in `keepExternalIds`.
 * Writes an ITEM_REMOVED history entry for each deletion.
 * Returns the deleted items so callers can broadcast INVENTORY:ITEM_REMOVED events.
 */
export async function deleteExternalItemsNotInList(params: {
  campaignId: UUID
  ownerId: UUID | null
  ownerType: 'character' | 'party'
  externalSource: string
  keepExternalIds: string[]
  actorUserId: UUID
  sessionId?: UUID
}): Promise<DeletedExternalItemResult[]> {
  const deleted = await deleteStaleExternalItems({
    campaignId: params.campaignId,
    ownerId: params.ownerId,
    externalSource: params.externalSource,
    keepExternalIds: params.keepExternalIds,
  })

  if (deleted.length === 0) return []

  const now = new Date()
  await Promise.all(
    deleted.map((row) =>
      createInventoryHistoryRecord({
        id: randomUUID() as UUID,
        campaignId: params.campaignId,
        itemId: row.id,
        sessionId: params.sessionId ?? null,
        actorUserId: params.actorUserId,
        actionType: InventoryActionType.ITEM_REMOVED,
        fromOwnerType: params.ownerType,
        fromOwnerId: params.ownerId,
        toOwnerType: null,
        toOwnerId: null,
        quantity: row.quantity,
        currencyDelta: null,
        itemName: row.name,
        notes: null,
        createdAt: now,
      })
    )
  )

  return deleted.map((row) => ({ item: mapItem(row) }))
}

/**
 * Sets a character's currency wallet to the provided absolute values.
 * Used for external sync where the source of truth (e.g. DDB) provides the full wallet state.
 * Records a history entry with the signed delta relative to the previous balance.
 */
export async function setExternalCurrencyWallet(params: {
  campaignId: UUID
  ownerId: UUID | null
  /** Defaults to 'character' — pass 'party' for party-targeted extension sync (ownerId null). */
  ownerType?: 'character' | 'party'
  wallet: Partial<CurrencyWallet>
  actorUserId: UUID
  sessionId?: UUID
}): Promise<CurrencyWalletDto> {
  const existing = await findOrCreateCurrencyWallet({
    campaignId: params.campaignId,
    ownerType: params.ownerType ?? 'character',
    ownerId: params.ownerId,
  })

  const newBalance: CurrencyWallet = {
    cp: params.wallet.cp ?? existing.cp,
    sp: params.wallet.sp ?? existing.sp,
    ep: params.wallet.ep ?? existing.ep,
    gp: params.wallet.gp ?? existing.gp,
    pp: params.wallet.pp ?? existing.pp,
  }

  const delta: Partial<CurrencyWallet> = {
    cp: newBalance.cp - existing.cp,
    sp: newBalance.sp - existing.sp,
    ep: newBalance.ep - existing.ep,
    gp: newBalance.gp - existing.gp,
    pp: newBalance.pp - existing.pp,
  }

  const now = new Date()
  const updated = await updateCurrencyWalletRecord({ id: existing.id, ...newBalance, updatedAt: now })

  await createInventoryHistoryRecord({
    id: randomUUID() as UUID,
    campaignId: params.campaignId,
    itemId: null,
    sessionId: params.sessionId ?? null,
    actorUserId: params.actorUserId,
    actionType: InventoryActionType.CURRENCY_CHANGED,
    fromOwnerType: null,
    fromOwnerId: null,
    toOwnerType: null,
    toOwnerId: null,
    quantity: null,
    currencyDelta: delta,
    itemName: null,
    notes: null,
    createdAt: now,
  })

  return mapWallet(updated)
}
