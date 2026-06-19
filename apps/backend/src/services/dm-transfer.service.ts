/**
 * DM Transfer Service
 * Manages pending campaign ownership handoff state in Redis.
 *
 * Flow: DM initiates → pending stored in Redis with TTL → target accepts/declines/DM cancels.
 * Only one pending transfer per campaign at a time.
 */

import { getRedisClient } from '@/infra/redis'

const TRANSFER_TTL_SECONDS = 60 * 60 * 24 // 24 hours

export interface PendingDmTransfer {
  campaignId: string
  campaignName: string
  fromUserId: string
  fromUsername: string
  toUserId: string
  toUsername: string
  initiatedAt: number // Unix ms
  expiresAt: number // Unix ms
}

function redisKey(campaignId: string): string {
  return `campaign:dm-transfer:${campaignId}`
}

/** Store a pending DM transfer for the campaign, replacing any existing one. */
export async function storePendingDmTransfer(transfer: PendingDmTransfer): Promise<void> {
  const redis = await getRedisClient()
  await redis.set(redisKey(transfer.campaignId), JSON.stringify(transfer), {
    EX: TRANSFER_TTL_SECONDS,
  })
}

/** Retrieve the current pending transfer for a campaign, or null if none. */
export async function getPendingDmTransfer(campaignId: string): Promise<PendingDmTransfer | null> {
  const redis = await getRedisClient()
  const raw = await redis.get(redisKey(campaignId))
  if (!raw) return null

  const parsed = JSON.parse(raw) as PendingDmTransfer
  if (parsed.expiresAt <= Date.now()) {
    await redis.del(redisKey(campaignId))
    return null
  }

  return parsed
}

/** Delete the pending transfer (cancel or after accept/decline). */
export async function clearPendingDmTransfer(campaignId: string): Promise<void> {
  const redis = await getRedisClient()
  await redis.del(redisKey(campaignId))
}

/**
 * Atomically reads and deletes the pending transfer.
 * Returns null if none exists or already expired.
 */
export async function consumePendingDmTransfer(
  campaignId: string
): Promise<PendingDmTransfer | null> {
  const transfer = await getPendingDmTransfer(campaignId)
  if (!transfer) return null
  await clearPendingDmTransfer(campaignId)
  return transfer
}
