import { getPrismaClient } from '@/infra/db'
import { sanitizeExternalSystem } from '@/utils/guest-auth.helpers'
import { isExternalSystemAuthAllowed } from '@/services/integrations.service'
import { issueDeviceCredential } from '@/services/auth/device-credential.service'

const prisma = getPrismaClient()

/**
 * In DEV passwordless mode we suffix the DM's externalUserId with '_dm' so that the
 * same DDB identity can simultaneously exist as a player ExternalIdentity (no suffix)
 * and a DM ExternalIdentity (_dm suffix) without hitting the unique constraint.
 * This is only ever true in local development — never in production.
 */
const isDevPasswordlessMode =
  (process.env.NODE_ENV || '').toLowerCase() === 'development' &&
  ['1', 'true', 'yes', 'on'].includes(
    String(process.env.ENABLE_PASSWORDLESS_LOGIN || '').toLowerCase()
  )

export interface DmLinkResult {
  deviceCredential: { credential: string; deviceId: string; expiresAt: Date }
  merged: boolean
  mergedAccount: {
    userId: string
    email: string | null
    charactersTransferred: number
    membershipsTransferred: number
  } | null
}

/**
 * Links a DM's full VTT-Chat account to their external system identity via Option B:
 * the CampaignExternalLink (not campaign.currentDmId) is the authority on who the DM is.
 *
 * First-time claim (no CampaignExternalLink for this campaign+system):
 *   - Any authenticated full account may claim DM status.
 *   - campaign.currentDmId is updated to the caller.
 *   - CampaignExternalLink is created with linkedBy = caller.
 *
 * Returning DM (CampaignExternalLink exists):
 *   - If linkedBy === callerUserId → same vtt-chat account, allow.
 *   - If linkedBy !== callerUserId but DDB externalUserId matches the linkedBy user's
 *     ExternalIdentity → same person on a different account (e.g. after account recovery);
 *     transfer ownership.
 *   - Otherwise → 'ALREADY_CLAIMED' (someone else is the DM).
 *
 * DEV mode: DM ExternalIdentity is stored with externalUserId suffixed '_dm' to avoid
 * unique-constraint collisions when the same DDB account is used for both DM and player
 * testing in a single dev environment.
 *
 * Throws:
 *  'NOT_FULL_ACCOUNT'           — caller has authType !== FULL
 *  'INTEGRATION_NOT_AUTHORIZED' — external system blocked by platform
 *  'CAMPAIGN_NOT_FOUND'         — campaignId does not exist
 *  'ALREADY_CLAIMED'            — a different DDB identity has already linked this campaign as DM
 *  'IDENTITY_CONFLICT'          — externalUserId already linked to a different full account
 */
export async function dmLinkAccount(params: {
  callerUserId: string
  callerAuthType: string
  campaignId: string
  externalSystem: string
  externalUserId: string
  externalCampaignId: string
  email: string
  displayName?: string | null
  deviceId: string
}): Promise<DmLinkResult> {
  if (params.callerAuthType !== 'FULL') {
    throw new Error('NOT_FULL_ACCOUNT')
  }

  const externalSystem = sanitizeExternalSystem(params.externalSystem)

  if (!isExternalSystemAuthAllowed(externalSystem)) {
    throw new Error('INTEGRATION_NOT_AUTHORIZED')
  }

  // In DEV, suffix _dm so the same DDB identity can coexist as player and DM.
  const effectiveExternalUserId = isDevPasswordlessMode
    ? `${params.externalUserId}_dm`
    : params.externalUserId

  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { currentDmId: true },
  })

  if (!campaign) {
    throw new Error('CAMPAIGN_NOT_FOUND')
  }

  // Determine whether this is a first-time claim or a returning DM.
  const existingLink = await prisma.campaignExternalLink.findFirst({
    where: { campaignId: params.campaignId, externalSystem },
    select: { id: true, linkedBy: true },
  })

  if (existingLink) {
    if (existingLink.linkedBy !== params.callerUserId) {
      // Different vtt-chat account — check if it's the same DDB person (account recovery).
      const linkedDmIdentity = await prisma.externalIdentity.findFirst({
        where: { userId: existingLink.linkedBy, externalSystem },
        select: { externalUserId: true },
      })

      if (!linkedDmIdentity || linkedDmIdentity.externalUserId !== effectiveExternalUserId) {
        // Genuinely different DDB identity — another user is the DM.
        throw new Error('ALREADY_CLAIMED')
      }

      // Same DDB identity on a new vtt-chat account — transfer ownership.
      await prisma.campaign.update({
        where: { id: params.campaignId },
        data: { currentDmId: params.callerUserId },
      })
      await prisma.campaignExternalLink.update({
        where: { id: existingLink.id },
        data: { linkedBy: params.callerUserId },
      })
    }
    // else: same vtt-chat account — returning DM on new device, no ownership change needed.
  } else {
    // First-time claim: take DM ownership of the campaign.
    await prisma.campaign.update({
      where: { id: params.campaignId },
      data: { currentDmId: params.callerUserId },
    })
  }

  // Upsert the DM's ExternalIdentity (using effectiveExternalUserId in DEV).
  await prisma.externalIdentity.upsert({
    where: {
      externalSystem_externalUserId: {
        externalSystem,
        externalUserId: effectiveExternalUserId,
      },
    },
    create: {
      userId: params.callerUserId,
      externalSystem,
      externalUserId: effectiveExternalUserId,
      email: params.email,
      lastSeenAt: new Date(),
    },
    update: {
      userId: params.callerUserId,
      email: params.email,
      lastSeenAt: new Date(),
    },
  })

  // Detect any conflicting identity with the same effective externalUserId but different userId.
  const conflict = await prisma.externalIdentity.findFirst({
    where: {
      externalSystem,
      externalUserId: effectiveExternalUserId,
      userId: { not: params.callerUserId },
    },
    include: {
      user: {
        select: { id: true, authType: true, email: true },
      },
    },
  })

  let merged = false
  let mergedAccount: DmLinkResult['mergedAccount'] = null

  if (conflict) {
    if (conflict.user.authType !== 'GUEST') {
      // Two full accounts with the same DDB identity — requires admin resolution.
      throw new Error('IDENTITY_CONFLICT')
    }

    const guestUserId = conflict.userId
    const { charactersTransferred, membershipsTransferred } = await mergeGuestAccount({
      guestUserId,
      callerUserId: params.callerUserId,
    })

    merged = true
    mergedAccount = {
      userId: guestUserId,
      email: conflict.user.email,
      charactersTransferred,
      membershipsTransferred,
    }
  }

  // Upsert CampaignExternalLink so dm-sync can run without re-entering the invite code.
  if (!existingLink) {
    await prisma.campaignExternalLink.create({
      data: {
        campaignId: params.campaignId,
        externalSystem,
        externalId: params.externalCampaignId.trim(),
        linkedBy: params.callerUserId,
      },
    })
  } else {
    await prisma.campaignExternalLink.update({
      where: { id: existingLink.id },
      data: { externalId: params.externalCampaignId.trim() },
    })
  }

  // Issue device credential so future launches use the returning-DM flow.
  const { credential, expiresAt } = await issueDeviceCredential({
    userId: params.callerUserId,
    deviceId: params.deviceId,
  })

  return {
    deviceCredential: { credential, deviceId: params.deviceId, expiresAt },
    merged,
    mergedAccount,
  }
}

/**
 * Transfers Characters and CampaignMemberships from a guest account to the DM's
 * full account, then soft-deletes the guest. Called only when the conflicting
 * ExternalIdentity belongs to a GUEST user.
 *
 * CampaignMembership transfer is idempotent: if the DM already has a membership
 * in the same campaign, the guest membership is discarded rather than duplicated.
 */
async function mergeGuestAccount(params: {
  guestUserId: string
  callerUserId: string
}): Promise<{ charactersTransferred: number; membershipsTransferred: number }> {
  const { guestUserId, callerUserId } = params

  // Transfer character ownership.
  const { count: charactersTransferred } = await prisma.character.updateMany({
    where: { userId: guestUserId },
    data: { userId: callerUserId },
  })

  // Transfer memberships, skipping campaigns where the DM already has one.
  const guestMemberships = await prisma.campaignMembership.findMany({
    where: { userId: guestUserId },
    select: { id: true, campaignId: true, role: true },
  })

  let membershipsTransferred = 0

  for (const membership of guestMemberships) {
    const existing = await prisma.campaignMembership.findUnique({
      where: {
        campaignId_userId: {
          campaignId: membership.campaignId,
          userId: callerUserId,
        },
      },
      select: { id: true },
    })

    if (!existing) {
      await prisma.campaignMembership.update({
        where: { id: membership.id },
        data: { userId: callerUserId },
      })
      membershipsTransferred++
    } else {
      await prisma.campaignMembership.delete({ where: { id: membership.id } })
    }
  }

  // Delete the guest's ExternalIdentity (the DM's upsert above already owns the slot).
  await prisma.externalIdentity.deleteMany({
    where: { userId: guestUserId },
  })

  // Soft-delete the guest user. Hard delete is deferred to a cleanup job so
  // chat message attribution (authorId FK) remains intact in history.
  await prisma.user.update({
    where: { id: guestUserId },
    data: { isActive: false },
  })

  return { charactersTransferred, membershipsTransferred }
}
