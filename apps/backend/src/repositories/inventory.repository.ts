import { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'
import type { ItemMetadata } from '@shared'

const prisma = getPrismaClient()

export interface InventoryItemRow {
  id: string
  campaignId: string
  ownerType: string
  ownerId: string | null
  name: string
  quantity: number
  source: 'SRD' | 'CUSTOM' | 'EXTERNAL'
  srdKey: string | null
  srdCategory: 'EQUIPMENT' | 'MAGIC_ITEM' | 'HOMEBREW'
  notes: string | null
  externalId: string | null
  externalSource: string | null
  addedByUserId: string
  createdAt: Date
  updatedAt: Date
  isContainer: boolean
  containerId: string | null
  metadata: ItemMetadata | null
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
  }) as unknown as Promise<InventoryItemRow[]>
}

export async function findInventoryItemById(id: string): Promise<InventoryItemRow | null> {
  return prisma.inventoryItem.findUnique({ where: { id } }) as unknown as Promise<InventoryItemRow | null>
}

export async function createInventoryItemRecord(params: {
  id: string
  campaignId: string
  ownerType: string
  ownerId: string | null
  name: string
  quantity: number
  source: 'SRD' | 'CUSTOM' | 'EXTERNAL'
  srdKey: string | null
  srdCategory: 'EQUIPMENT' | 'MAGIC_ITEM' | 'HOMEBREW'
  notes: string | null
  externalId: string | null
  externalSource: string | null
  addedByUserId: string
  createdAt: Date
  updatedAt: Date
  isContainer?: boolean
  containerId?: string | null
  metadata?: ItemMetadata | null
}): Promise<InventoryItemRow> {
  return prisma.inventoryItem.create({
    data: {
      ...params,
      isContainer: params.isContainer ?? false,
      containerId: params.containerId ?? null,
      metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  }) as Promise<InventoryItemRow>
}

export async function findInventoryItemByExternalId(params: {
  campaignId: string
  ownerId: string | null
  externalSource: string
  externalId: string
}): Promise<InventoryItemRow | null> {
  return prisma.inventoryItem.findFirst({
    where: {
      campaignId: params.campaignId,
      ownerId: params.ownerId,
      externalSource: params.externalSource,
      externalId: params.externalId,
    },
  }) as unknown as Promise<InventoryItemRow | null>
}

/**
 * Upserts an external item with three-level matching:
 * 1. Match by (campaignId, ownerId, externalSource, externalId) → update in-place.
 * 2. Match by (campaignId, ownerId, name, externalId IS NULL) → claim the existing item
 *    by stamping externalId/externalSource onto it (SRD name-connect).
 * 3. No match → create new EXTERNAL item.
 *
 * Returns `created` (new row) and `changed` (row content was actually modified — false when
 * an update left all fields identical, so callers can skip history writes and WS events).
 */
export async function upsertExternalInventoryItem(params: {
  campaignId: string
  ownerId: string | null
  ownerType: string
  externalSource: string
  externalId: string
  name: string
  quantity: number
  srdKey: string | null
  srdCategory: 'EQUIPMENT' | 'MAGIC_ITEM' | 'HOMEBREW'
  notes: string | null
  addedByUserId: string
  now: Date
  isContainer?: boolean
  metadata?: ItemMetadata | null
}): Promise<{ row: InventoryItemRow; created: boolean; changed: boolean }> {
  // Level 1: match by external key
  const byExternalId = await findInventoryItemByExternalId({
    campaignId: params.campaignId,
    ownerId: params.ownerId,
    externalSource: params.externalSource,
    externalId: params.externalId,
  })

  const metadataValue = params.metadata
    ? (params.metadata as Prisma.InputJsonValue)
    : Prisma.JsonNull

  if (byExternalId) {
    const isChanged =
      byExternalId.name !== params.name ||
      byExternalId.quantity !== params.quantity ||
      (byExternalId.notes ?? null) !== (params.notes ?? null) ||
      (params.metadata !== undefined)

    if (!isChanged) return { row: byExternalId, created: false, changed: false }

    const row = await prisma.inventoryItem.update({
      where: { id: byExternalId.id },
      data: {
        name: params.name,
        quantity: params.quantity,
        notes: params.notes,
        updatedAt: params.now,
        ...(params.isContainer !== undefined ? { isContainer: params.isContainer } : {}),
        ...(params.metadata !== undefined ? { metadata: metadataValue } : {}),
      },
    })
    return { row: row as InventoryItemRow, created: false, changed: true }
  }

  // Level 2: name-connect — claim an existing unlinked item with the same name
  const byName = await prisma.inventoryItem.findFirst({
    where: {
      campaignId: params.campaignId,
      ownerId: params.ownerId,
      name: { equals: params.name, mode: 'insensitive' },
      externalId: null,
    },
  })

  if (byName) {
    const row = await prisma.inventoryItem.update({
      where: { id: byName.id },
      data: {
        externalId: params.externalId,
        externalSource: params.externalSource,
        srdKey: byName.srdKey ?? params.srdKey,
        name: params.name,
        quantity: params.quantity,
        notes: params.notes,
        updatedAt: params.now,
        ...(params.isContainer !== undefined ? { isContainer: params.isContainer } : {}),
        ...(params.metadata !== undefined ? { metadata: metadataValue } : {}),
      },
    })
    return { row: row as InventoryItemRow, created: false, changed: true }
  }

  // Level 3: create new
  const { randomUUID } = await import('node:crypto')
  const row = await createInventoryItemRecord({
    id: randomUUID(),
    campaignId: params.campaignId,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    name: params.name,
    quantity: params.quantity,
    source: 'EXTERNAL',
    srdKey: params.srdKey,
    srdCategory: params.srdCategory,
    notes: params.notes,
    externalId: params.externalId,
    externalSource: params.externalSource,
    addedByUserId: params.addedByUserId,
    createdAt: params.now,
    updatedAt: params.now,
    isContainer: params.isContainer ?? false,
    metadata: params.metadata,
  })
  return { row, created: true, changed: true }
}

/**
 * Deletes all items for the given owner+source whose externalId is NOT in `keepExternalIds`.
 * Returns the deleted rows so callers can write history entries and broadcast ITEM_REMOVED.
 */
export async function deleteStaleExternalItems(params: {
  campaignId: string
  ownerId: string | null
  externalSource: string
  keepExternalIds: string[]
}): Promise<InventoryItemRow[]> {
  const toDelete = await prisma.inventoryItem.findMany({
    where: {
      campaignId: params.campaignId,
      ownerId: params.ownerId,
      externalSource: params.externalSource,
      externalId: {
        not: null,
        notIn: params.keepExternalIds.length > 0 ? params.keepExternalIds : ['__never__'],
      },
    },
  })

  if (toDelete.length === 0) return []

  await prisma.inventoryItem.deleteMany({
    where: { id: { in: toDelete.map((r) => r.id) } },
  })

  return toDelete as unknown as InventoryItemRow[]
}

export async function updateInventoryItemRecord(params: {
  id: string
  name?: string
  quantity?: number
  notes?: string | null
  containerId?: string | null
  metadata?: ItemMetadata | null
  updatedAt: Date
}): Promise<InventoryItemRow> {
  const { id, updatedAt, metadata, ...rest } = params
  return prisma.inventoryItem.update({
    where: { id },
    data: {
      ...rest,
      updatedAt,
      ...(metadata !== undefined
        ? { metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull }
        : {}),
    },
  }) as unknown as Promise<InventoryItemRow>
}

/** Finds all items whose containerId matches the given container item ID. */
export async function findItemsInContainer(containerId: string): Promise<InventoryItemRow[]> {
  return prisma.inventoryItem.findMany({ where: { containerId } }) as unknown as Promise<InventoryItemRow[]>
}

/** Deletes a container item and all items contained within it atomically. */
export async function deleteContainerWithContents(containerId: string): Promise<void> {
  await prisma.$transaction([
    prisma.inventoryItem.deleteMany({ where: { containerId } }),
    prisma.inventoryItem.delete({ where: { id: containerId } }),
  ])
}

export async function deleteInventoryItemRecord(id: string): Promise<void> {
  await prisma.inventoryItem.delete({ where: { id } })
}

export async function transferInventoryItemRecord(params: {
  id: string
  toOwnerType: string
  toOwnerId: string | null
  updatedAt: Date
  clearContainerId?: boolean
}): Promise<InventoryItemRow> {
  return prisma.inventoryItem.update({
    where: { id: params.id },
    data: {
      ownerType: params.toOwnerType,
      ownerId: params.toOwnerId,
      updatedAt: params.updatedAt,
      // Always clear containerId on transfer — the source container stays with the old owner
      containerId: params.clearContainerId !== false ? null : undefined,
    },
  }) as unknown as Promise<InventoryItemRow>
}

/**
 * Atomically transfers a container and all of its contained items to a new owner.
 * Returns the updated container row and all updated content rows.
 */
export async function transferContainerWithContentsRecord(params: {
  containerId: string
  toOwnerType: string
  toOwnerId: string | null
  updatedAt: Date
}): Promise<{ container: InventoryItemRow; contents: InventoryItemRow[] }> {
  const contentIds = await prisma.inventoryItem
    .findMany({ where: { containerId: params.containerId }, select: { id: true } })
    .then((rows) => rows.map((r) => r.id))

  const updateData = {
    ownerType: params.toOwnerType,
    ownerId: params.toOwnerId,
    updatedAt: params.updatedAt,
  }

  await prisma.$transaction([
    prisma.inventoryItem.update({ where: { id: params.containerId }, data: updateData }),
    ...(contentIds.length > 0
      ? [prisma.inventoryItem.updateMany({ where: { id: { in: contentIds } }, data: updateData })]
      : []),
  ])

  const [container, contents] = await Promise.all([
    prisma.inventoryItem.findUniqueOrThrow({ where: { id: params.containerId } }),
    contentIds.length > 0
      ? prisma.inventoryItem.findMany({ where: { id: { in: contentIds } } })
      : Promise.resolve([]),
  ])

  return {
    container: container as unknown as InventoryItemRow,
    contents: contents as unknown as InventoryItemRow[],
  }
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
  ownerType?: 'party' | 'character'
  ownerId?: string | null
  dateFrom?: Date
  dateTo?: Date
  /**
   * When set, restricts results to entries visible to this player:
   * their own character history (ownerId = viewerUserId) plus party history.
   * Takes precedence over ownerType/ownerId when present.
   */
  viewerUserId?: string
}): Promise<InventoryHistoryRow[]> {
  const { ownerType, ownerId, dateFrom, dateTo, viewerUserId } = params

  let ownerWhere: object | undefined

  if (viewerUserId) {
    // Player-scoped view: own character entries OR party entries
    ownerWhere = {
      OR: [
        { fromOwnerType: 'character', fromOwnerId: viewerUserId },
        { toOwnerType: 'character', toOwnerId: viewerUserId },
        { actorUserId: viewerUserId },
        { fromOwnerType: 'party', fromOwnerId: null },
        { toOwnerType: 'party', toOwnerId: null },
      ],
    }
  } else {
    // Owner filter: match any history row where the actor's owned entity appears
    // in either the from or to side of the action.
    ownerWhere =
      ownerType === 'party'
        ? {
            OR: [
              { fromOwnerType: 'party', fromOwnerId: null },
              { toOwnerType: 'party', toOwnerId: null },
            ],
          }
        : ownerType === 'character' && ownerId
          ? {
              OR: [
                { fromOwnerType: 'character', fromOwnerId: ownerId },
                { toOwnerType: 'character', toOwnerId: ownerId },
                { actorUserId: ownerId },
              ],
            }
          : undefined
  }

  return prisma.inventoryHistoryEntry.findMany({
    where: {
      campaignId: params.campaignId,
      ...(ownerWhere ?? {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit ?? 50,
    skip: params.offset ?? 0,
  })
}
