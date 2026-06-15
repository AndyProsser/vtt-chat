/**
 * Inventory Service
 * All campaign-scoped inventory mutations: items and currency wallets.
 * Every mutating function returns enough data for the caller to build the WS EventEnvelope.
 */

import { randomUUID } from 'node:crypto'
import { InventoryItemSource, InventoryActionType } from '@shared'
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
  notes: string | null
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
    notes: row.notes,
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
  offset = 0
): Promise<InventoryHistoryDto[]> {
  const [rows, dmId] = await Promise.all([
    listInventoryHistory({ campaignId, limit, offset }),
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
  notes?: string
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
    notes: params.notes ?? null,
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
