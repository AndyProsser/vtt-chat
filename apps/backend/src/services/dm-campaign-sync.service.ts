import type { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'
import { mergeCharacterMetadata } from '@shared'
import { sanitizeExternalSystem } from '@/utils/guest-auth.helpers'

const prisma = getPrismaClient()

export interface DmSyncCharacterInput {
  /** DDB character ID — required; used as the upsert key. */
  externalCharacterId: string
  /** DDB user ID of the character's owner — required for ExternalIdentity lookup. */
  externalUserId: string
  displayName?: string | null
  name?: string | null
  level?: number | null
  avatarUrl?: string | null
  characterUrl?: string | null
}

export interface DmSyncCampaignData {
  name?: string | null
  description?: string | null
  publicNotes?: string | null
  dmExternalUserId?: string | null
  dmUsername?: string | null
  dateCreated?: string | null
  memberCount?: number | null
}

export interface DmCampaignSyncResult {
  ok: boolean
  code?: string
  message?: string
  applied?: {
    campaignUpdated: boolean
    charactersProvisioned: number
    charactersLinked: number
    charactersSkipped: number
  }
}

/**
 * DM-triggered full campaign sync from the extension popup.
 *
 * For each character the DDB campaign page reports, the backend:
 *   1. Matches by ExternalIdentity (externalSystem + externalUserId) and upserts
 *      the character against the linked VTT-Chat user (§5f step 1).
 *   2. If no ExternalIdentity exists, creates or updates an unowned stub character
 *      with userId=null (§5f step 2). The stub is idempotent.
 *
 * Lazy promotion (§5f step 3) happens automatically: when a player later calls
 * loginGuestViaExtension, upsertCharacter finds the stub by (externalSystem, externalId)
 * and sets userId on it — no special promotion code needed here.
 *
 * Caller must be the campaign DM; the route enforces this before calling.
 */
export async function dmCampaignSync(params: {
  campaignId: string
  externalSystem: string
  externalCampaignId: string
  campaignData?: DmSyncCampaignData
  characters: DmSyncCharacterInput[]
  actorUserId: string
  actorUsername: string
}): Promise<DmCampaignSyncResult> {
  const externalSystem = sanitizeExternalSystem(params.externalSystem)

  // ─── Campaign update ─────────────────────────────────────────────────────────

  let campaignUpdated = false

  // Apply campaign name from external system when provided (DDB is source of truth).
  const incomingName =
    params.campaignData?.name && typeof params.campaignData.name === 'string'
      ? params.campaignData.name.trim()
      : null

  if (incomingName) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.campaignId },
      select: { name: true },
    })
    if (campaign && campaign.name !== incomingName) {
      await prisma.campaign.update({
        where: { id: params.campaignId },
        data: { name: incomingName },
      })
      campaignUpdated = true
    }
  }

  // Upsert the CampaignExternalLink so we know which DDB campaign this maps to.
  const existingLink = await prisma.campaignExternalLink.findFirst({
    where: {
      campaignId: params.campaignId,
      externalSystem,
    },
    select: { id: true, externalId: true },
  })

  if (!existingLink) {
    await prisma.campaignExternalLink.create({
      data: {
        campaignId: params.campaignId,
        externalSystem,
        externalId: params.externalCampaignId.trim(),
        linkedBy: params.actorUserId,
      },
    })
    campaignUpdated = true
  } else if (existingLink.externalId !== params.externalCampaignId.trim()) {
    await prisma.campaignExternalLink.update({
      where: { id: existingLink.id },
      data: { externalId: params.externalCampaignId.trim() },
    })
    campaignUpdated = true
  }

  // ─── Character resolution ─────────────────────────────────────────────────────

  let charactersLinked = 0
  let charactersProvisioned = 0
  let charactersSkipped = 0

  for (const entry of params.characters) {
    const externalCharacterId = String(entry.externalCharacterId || '').trim()
    const externalUserId = String(entry.externalUserId || '').trim()

    if (!externalCharacterId || !externalUserId) {
      charactersSkipped++
      continue
    }

    // Step 1 — match by ExternalIdentity to find the owning VTT-Chat user.
    const identity = await prisma.externalIdentity.findUnique({
      where: {
        externalSystem_externalUserId: { externalSystem, externalUserId },
      },
      select: { userId: true },
    })

    const metadata = buildStubMetadata(entry)

    if (identity) {
      // Known player — upsert character against their account (same as §5b sync).
      await upsertLinkedCharacter({
        campaignId: params.campaignId,
        userId: identity.userId,
        externalSystem,
        externalCharacterId,
        externalUserId,
        entry,
        metadata,
      })
      charactersLinked++
    } else {
      // Unknown player — create or update an unowned stub.
      await upsertStubCharacter({
        campaignId: params.campaignId,
        externalSystem,
        externalCharacterId,
        externalUserId,
        entry,
        metadata,
      })
      charactersProvisioned++
    }
  }

  // ─── Audit log ───────────────────────────────────────────────────────────────

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: params.actorUserId,
      actorName: params.actorUsername,
      actorRole: 'DM',
      action: 'dm_campaign_sync',
      targetType: 'Campaign',
      targetId: params.campaignId,
      outcome: 'SUCCESS',
      metadata: {
        externalSystem,
        externalCampaignId: params.externalCampaignId,
        campaignUpdated,
        charactersLinked,
        charactersProvisioned,
        charactersSkipped,
      },
    },
  })

  return {
    ok: true,
    applied: {
      campaignUpdated,
      charactersProvisioned,
      charactersLinked,
      charactersSkipped,
    },
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildStubMetadata(entry: DmSyncCharacterInput): Prisma.InputJsonValue {
  return mergeCharacterMetadata(null, {
    level: typeof entry.level === 'number' && entry.level > 0 ? entry.level : undefined,
    characterUrl: typeof entry.characterUrl === 'string' ? entry.characterUrl : undefined,
  }) as Prisma.InputJsonValue
}

/**
 * Upsert a character for a player whose VTT-Chat account is known.
 * Matched by (campaignId, externalSystem, externalId); falls back to create.
 */
async function upsertLinkedCharacter(params: {
  campaignId: string
  userId: string
  externalSystem: string
  externalCharacterId: string
  externalUserId: string
  entry: DmSyncCharacterInput
  metadata: Prisma.InputJsonValue
}): Promise<void> {
  const existing = await prisma.character.findFirst({
    where: {
      campaignId: params.campaignId,
      externalSystem: params.externalSystem,
      externalId: params.externalCharacterId,
    },
    select: { id: true, metadata: true },
  })

  const commonData = buildCharacterData(params)

  if (existing) {
    // Preserve any richer metadata already on the record; DM sync only fills gaps.
    const mergedMetadata = mergeCharacterMetadata(existing.metadata, {
      level: typeof params.entry.level === 'number' ? params.entry.level : undefined,
      characterUrl:
        typeof params.entry.characterUrl === 'string' ? params.entry.characterUrl : undefined,
    }) as Prisma.InputJsonValue

    await prisma.character.update({
      where: { id: existing.id },
      data: { ...commonData, userId: params.userId, metadata: mergedMetadata },
    })
  } else {
    await prisma.character.create({
      data: {
        campaignId: params.campaignId,
        userId: params.userId,
        externalSystem: params.externalSystem,
        externalId: params.externalCharacterId,
        externalUserId: params.externalUserId,
        ...commonData,
        metadata: params.metadata,
      },
    })
  }
}

/**
 * Upsert an unowned stub character (userId=null) for a player with no VTT-Chat account.
 * Idempotent: re-running updates the stub's metadata without creating duplicates.
 * The stub is promoted to a real character in upsertCharacter (extension.service.ts)
 * the moment the player logs in via the extension.
 */
async function upsertStubCharacter(params: {
  campaignId: string
  externalSystem: string
  externalCharacterId: string
  externalUserId: string
  entry: DmSyncCharacterInput
  metadata: Prisma.InputJsonValue
}): Promise<void> {
  const existing = await prisma.character.findFirst({
    where: {
      campaignId: params.campaignId,
      externalSystem: params.externalSystem,
      externalId: params.externalCharacterId,
    },
    select: { id: true, metadata: true, userId: true },
  })

  const commonData = buildCharacterData(params)

  if (existing) {
    // Already exists (possibly already promoted by a player login — don't clear userId).
    const mergedMetadata = mergeCharacterMetadata(existing.metadata, {
      level: typeof params.entry.level === 'number' ? params.entry.level : undefined,
      characterUrl:
        typeof params.entry.characterUrl === 'string' ? params.entry.characterUrl : undefined,
    }) as Prisma.InputJsonValue

    await prisma.character.update({
      where: { id: existing.id },
      data: { ...commonData, externalUserId: params.externalUserId, metadata: mergedMetadata },
    })
  } else {
    await prisma.character.create({
      data: {
        campaignId: params.campaignId,
        userId: null,
        externalSystem: params.externalSystem,
        externalId: params.externalCharacterId,
        externalUserId: params.externalUserId,
        ...commonData,
        metadata: params.metadata,
      },
    })
  }
}

function buildCharacterData(params: {
  entry: DmSyncCharacterInput
}): { name: string; avatarUrl?: string } {
  // name is required on Character; fall back to displayName then a safe placeholder.
  const name =
    (typeof params.entry.name === 'string' ? params.entry.name.trim() : '') ||
    (typeof params.entry.displayName === 'string' ? params.entry.displayName.trim() : '') ||
    'Unknown Character'

  const avatarUrl =
    typeof params.entry.avatarUrl === 'string' && params.entry.avatarUrl.trim()
      ? params.entry.avatarUrl.trim()
      : undefined

  return avatarUrl ? { name, avatarUrl } : { name }
}
