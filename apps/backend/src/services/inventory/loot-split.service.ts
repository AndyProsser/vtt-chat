/**
 * Loot Split Service
 * Manages the lifecycle of a /loot-split proposal:
 *   1. DM proposes split → stored in Redis with 60s TTL
 *   2. Players accept → their share transfers from party to character inventory
 *   3. On expiry → unaccepted shares are left in party (no-op; party item untouched until fully
 *      accepted); INVENTORY:LOOT_SPLIT_EXPIRED is broadcast and Redis key removed
 *
 * Redis key: loot-split:{campaignId}:{splitId}
 * TTL: 60 seconds
 */

import { randomUUID } from 'node:crypto'
import type { UUID } from '@shared'
import { getRedisClient } from '@/infra/redis'
import { partialTransferInventoryItem, findItemByOwnerAndName } from './inventory.service'
import type { InventoryItemDto } from './inventory.service'

const SPLIT_TTL_MS = 60_000
const SPLIT_TTL_S = 60

export interface LootSplitShare {
  userId: UUID
  quantity: number
  accepted: boolean
}

export interface LootSplitState {
  splitId: UUID
  campaignId: UUID
  sessionId: UUID
  itemId: UUID
  itemName: string
  totalQuantity: number
  shares: LootSplitShare[]
  proposedByUserId: UUID
  proposedAt: number
  expiresAt: number
}

export type CreateSplitResult =
  | { ok: true; split: LootSplitState }
  | { ok: false; error: string }

export type AcceptSplitResult =
  | { ok: true; split: LootSplitState; transferredItem: InventoryItemDto }
  | { ok: false; error: string; code: 'NOT_FOUND' | 'ALREADY_ACCEPTED' | 'EXPIRED' | 'NOT_IN_SPLIT' }

function redisKey(campaignId: UUID, splitId: UUID): string {
  return `loot-split:${campaignId}:${splitId}`
}

async function saveSplit(split: LootSplitState): Promise<void> {
  const client = await getRedisClient()
  await client.set(redisKey(split.campaignId, split.splitId), JSON.stringify(split), { EX: SPLIT_TTL_S })
}

export async function getSplit(campaignId: UUID, splitId: UUID): Promise<LootSplitState | null> {
  const client = await getRedisClient()
  const raw = await client.get(redisKey(campaignId, splitId))
  if (!raw) return null
  return JSON.parse(raw) as LootSplitState
}

export async function deleteSplit(campaignId: UUID, splitId: UUID): Promise<void> {
  const client = await getRedisClient()
  await client.del(redisKey(campaignId, splitId))
}

/**
 * Create a new loot split proposal.
 * Divides `totalQuantity` of `item` among `playerIds` (floor division; remainder stays in party).
 * Returns the split state and schedules a 60s expiry callback.
 */
export async function createLootSplit(params: {
  campaignId: UUID
  sessionId: UUID
  item: InventoryItemDto
  totalQuantity: number
  playerIds: UUID[]
  proposedByUserId: UUID
  onExpire: (split: LootSplitState) => Promise<void>
}): Promise<CreateSplitResult> {
  const { campaignId, sessionId, item, totalQuantity, playerIds, proposedByUserId, onExpire } = params

  if (playerIds.length === 0) {
    return { ok: false, error: 'No connected players to split with.' }
  }
  if (totalQuantity < playerIds.length) {
    return {
      ok: false,
      error: `Not enough ${item.name} (${totalQuantity}) to give one to each of the ${playerIds.length} players.`,
    }
  }

  const shareQty = Math.floor(totalQuantity / playerIds.length)
  const splitId = randomUUID() as UUID
  const now = Date.now()

  const split: LootSplitState = {
    splitId,
    campaignId,
    sessionId,
    itemId: item.id,
    itemName: item.name,
    totalQuantity,
    shares: playerIds.map((userId) => ({ userId, quantity: shareQty, accepted: false })),
    proposedByUserId,
    proposedAt: now,
    expiresAt: now + SPLIT_TTL_MS,
  }

  await saveSplit(split)

  // Schedule expiry callback — fires even if the process is still running.
  // In a multi-process deployment this would need a distributed job; for now
  // a single-process setTimeout is sufficient (session is pinned to one backend).
  setTimeout(async () => {
    const current = await getSplit(campaignId, splitId)
    if (!current) return // already completed or manually cleaned up
    await deleteSplit(campaignId, splitId)
    await onExpire(current)
  }, SPLIT_TTL_MS)

  return { ok: true, split }
}

/**
 * Accept a player's share of a loot split.
 * Validates: split exists, not expired, player is in the split, hasn't already accepted.
 * Transfers their share from party inventory to their character.
 */
export async function acceptLootSplit(params: {
  campaignId: UUID
  splitId: UUID
  userId: UUID
}): Promise<AcceptSplitResult> {
  const { campaignId, splitId, userId } = params

  const split = await getSplit(campaignId, splitId)
  if (!split) {
    return { ok: false, error: 'Loot split not found or expired.', code: 'NOT_FOUND' }
  }
  if (Date.now() > split.expiresAt) {
    await deleteSplit(campaignId, splitId)
    return { ok: false, error: 'This loot split has expired.', code: 'EXPIRED' }
  }

  const shareIndex = split.shares.findIndex((s) => s.userId === userId)
  if (shareIndex === -1) {
    return { ok: false, error: 'You are not part of this loot split.', code: 'NOT_IN_SPLIT' }
  }
  if (split.shares[shareIndex].accepted) {
    return { ok: false, error: 'You have already accepted your share.', code: 'ALREADY_ACCEPTED' }
  }

  const { quantity } = split.shares[shareIndex]

  // Find the party item (may have been partially claimed by earlier acceptees)
  const partyItem = await findItemByOwnerAndName({
    campaignId,
    ownerType: 'party',
    ownerId: null,
    name: split.itemName,
  })
  if (!partyItem || partyItem.quantity < quantity) {
    return { ok: false, error: `Party no longer has enough ${split.itemName}.`, code: 'NOT_FOUND' }
  }

  const transferredItem = await partialTransferInventoryItem({
    item: partyItem,
    qty: quantity,
    campaignId,
    toOwnerType: 'character',
    toOwnerId: userId,
    actorUserId: userId,
    sessionId: split.sessionId,
  })

  // Mark accepted in Redis
  split.shares[shareIndex].accepted = true
  const remainingTTL = Math.max(1, Math.floor((split.expiresAt - Date.now()) / 1000))
  const client = await getRedisClient()
  await client.set(redisKey(campaignId, splitId), JSON.stringify(split), { EX: remainingTTL })

  return { ok: true, split, transferredItem }
}
