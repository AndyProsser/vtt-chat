import { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export interface InventoryItemRow {
  id: string
  campaignId: string
  ownerType: string
  ownerId: string | null
  name: string
  quantity: number
  source: 'SRD' | 'CUSTOM'
  srdKey: string | null
  notes: string | null
  addedByUserId: string
  createdAt: Date
  updatedAt: Date
}

export interface CurrencyWalletRow {
  id: string
  campaignId: string
  ownerType: string
  ownerId: string | null
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
  updatedAt: Date
}

export interface InventoryHistoryRow {
  id: string
  campaignId: string
  itemId: string | null
  sessionId: string | null
  actorUserId: string
  actionType: string
  fromOwnerType: string | null
  fromOwnerId: string | null
  toOwnerType: string | null
  toOwnerId: string | null
  quantity: number | null
  currencyDelta: unknown
  itemName: string | null
  notes: string | null
  createdAt: Date
}

// ─── Items ──────────────────────────────────────────────────────────────────

export async function listCampaignInventoryItems(campaignId: string): Promise<InventoryItemRow[]> {
  return prisma.inventoryItem.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function findInventoryItemById(id: string): Promise<InventoryItemRow | null> {
  return prisma.inventoryItem.findUnique({ where: { id } })
}

export async function createInventoryItemRecord(params: {
  id: string
  campaignId: string
  ownerType: string
  ownerId: string | null
  name: string
  quantity: number
  source: 'SRD' | 'CUSTOM'
  srdKey: string | null
  notes: string | null
  addedByUserId: string
  createdAt: Date
  updatedAt: Date
}): Promise<InventoryItemRow> {
  return prisma.inventoryItem.create({ data: params })
}

export async function updateInventoryItemRecord(params: {
  id: string
  name?: string
  quantity?: number
  notes?: string | null
  updatedAt: Date
}): Promise<InventoryItemRow> {
  const { id, updatedAt, ...rest } = params
  return prisma.inventoryItem.update({
    where: { id },
    data: { ...rest, updatedAt },
  })
}

export async function deleteInventoryItemRecord(id: string): Promise<void> {
  await prisma.inventoryItem.delete({ where: { id } })
}

export async function transferInventoryItemRecord(params: {
  id: string
  toOwnerType: string
  toOwnerId: string | null
  updatedAt: Date
}): Promise<InventoryItemRow> {
  return prisma.inventoryItem.update({
    where: { id: params.id },
    data: {
      ownerType: params.toOwnerType,
      ownerId: params.toOwnerId,
      updatedAt: params.updatedAt,
    },
  })
}

// ─── Currency Wallets ────────────────────────────────────────────────────────

export async function listCampaignCurrencyWallets(campaignId: string): Promise<CurrencyWalletRow[]> {
  return prisma.currencyWallet.findMany({ where: { campaignId } })
}

export async function findOrCreateCurrencyWallet(params: {
  campaignId: string
  ownerType: string
  ownerId: string | null
}): Promise<CurrencyWalletRow> {
  const existing = await prisma.currencyWallet.findFirst({
    where: {
      campaignId: params.campaignId,
      ownerType: params.ownerType,
      ownerId: params.ownerId ?? null,
    },
  })
  if (existing) return existing

  return prisma.currencyWallet.create({
    data: {
      campaignId: params.campaignId,
      ownerType: params.ownerType,
      ownerId: params.ownerId ?? null,
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
      updatedAt: new Date(),
    },
  })
}

export async function updateCurrencyWalletRecord(params: {
  id: string
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
  updatedAt: Date
}): Promise<CurrencyWalletRow> {
  const { id, updatedAt, ...rest } = params
  return prisma.currencyWallet.update({ where: { id }, data: { ...rest, updatedAt } })
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function createInventoryHistoryRecord(params: {
  id: string
  campaignId: string
  itemId: string | null
  sessionId: string | null
  actorUserId: string
  actionType: string
  fromOwnerType: string | null
  fromOwnerId: string | null
  toOwnerType: string | null
  toOwnerId: string | null
  quantity: number | null
  currencyDelta: object | null
  itemName: string | null
  notes: string | null
  createdAt: Date
}): Promise<InventoryHistoryRow> {
  return prisma.inventoryHistoryEntry.create({
    data: {
      ...params,
      currencyDelta: params.currencyDelta ?? Prisma.JsonNull,
    },
  })
}

export async function listInventoryHistory(params: {
  campaignId: string
  limit?: number
  offset?: number
}): Promise<InventoryHistoryRow[]> {
  return prisma.inventoryHistoryEntry.findMany({
    where: { campaignId: params.campaignId },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 50,
    skip: params.offset ?? 0,
  })
}
