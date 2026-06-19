import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export interface PendingExtensionSyncRow {
  id: string
  campaignId: string
  characterId: string
  externalSource: string
  externalId: string
  kind: 'ITEM' | 'CURRENCY'
  incomingPayload: unknown
  existingSnapshot: unknown
  createdAt: Date
  expiresAt: Date
}

const PENDING_EXTENSION_SYNC_TTL_MS = 24 * 60 * 60 * 1000

export async function createPendingExtensionSyncRecord(params: {
  id: string
  campaignId: string
  characterId: string
  externalSource: string
  externalId: string
  kind: 'ITEM' | 'CURRENCY'
  incomingPayload: unknown
  existingSnapshot: unknown
  now: Date
}): Promise<PendingExtensionSyncRow> {
  return prisma.pendingExtensionSync.create({
    data: {
      id: params.id,
      campaignId: params.campaignId,
      characterId: params.characterId,
      externalSource: params.externalSource,
      externalId: params.externalId,
      kind: params.kind,
      incomingPayload: params.incomingPayload as object,
      existingSnapshot: params.existingSnapshot as object,
      createdAt: params.now,
      expiresAt: new Date(params.now.getTime() + PENDING_EXTENSION_SYNC_TTL_MS),
    },
  }) as Promise<PendingExtensionSyncRow>
}

/**
 * Lists non-expired pending syncs for a campaign, oldest first.
 * Expired rows are filtered out here (TTL-on-read, same convention as DeviceCredential) —
 * there is no separate sweep job.
 */
export async function listPendingExtensionSyncs(campaignId: string): Promise<PendingExtensionSyncRow[]> {
  return prisma.pendingExtensionSync.findMany({
    where: { campaignId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
  }) as Promise<PendingExtensionSyncRow[]>
}

/** Returns null for missing or expired (treated as not-found) pending syncs. */
export async function findPendingExtensionSyncById(
  id: string,
  campaignId: string
): Promise<PendingExtensionSyncRow | null> {
  const row = await prisma.pendingExtensionSync.findUnique({ where: { id } })
  if (!row || row.campaignId !== campaignId) return null
  if (row.expiresAt.getTime() < Date.now()) return null
  return row as PendingExtensionSyncRow
}

export async function deletePendingExtensionSyncRecord(id: string): Promise<void> {
  await prisma.pendingExtensionSync.delete({ where: { id } }).catch(() => undefined)
}
