import { getPrismaClient } from '@/infra/db'
import { sanitizeExternalSystem } from '@/utils/guest-auth.helpers'
import { isExternalSystemAuthAllowed } from '@/services/integrations.service'
import { issueDeviceCredential } from '@/services/auth/device-credential.service'

const prisma = getPrismaClient()

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
 * Links a DM's full VTT-Chat account to their external system identity.
 *
 * Actions performed (in order):
 *  1. Validates full-account token and DM role on the campaign.
 *  2. Validates the external system is platform-authorized.
 *  3. Upserts ExternalIdentity: (externalSystem, externalUserId) → callerUserId.
 *  4. Detects any conflicting guest ExternalIdentity with the same externalUserId.
 *     If found: transfers Characters + CampaignMemberships, soft-deletes guest user.
 *     If the conflict is a full account: throws IDENTITY_CONFLICT (admin resolution needed).
 *  5. Upserts CampaignExternalLink for (campaignId, externalSystem, externalCampaignId).
 *  6. Issues a deviceCredential for future returning DM launches.
 *
 * Throws:
 *  'NOT_FULL_ACCOUNT'       — caller has authType !== FULL
 *  'NOT_CAMPAIGN_DM'        — caller is not currentDmId of campaignId
 *  'INTEGRATION_NOT_AUTHORIZED' — external system blocked by platform
 *  'IDENTITY_CONFLICT'      — externalUserId already linked to a different full account
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

  // Verify caller is the campaign DM.
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { currentDmId: true },
  })

  if (!campaign || campaign.currentDmId !== params.callerUserId) {
    throw new Error('NOT_CAMPAIGN_DM')
  }

  // Upsert ExternalIdentity for the DM's full account.
  await prisma.externalIdentity.upsert({
    where: {
      externalSystem_externalUserId: {
        externalSystem,
        externalUserId: params.externalUserId,
      },
    },
    create: {
      userId: params.callerUserId,
      externalSystem,
      externalUserId: params.externalUserId,
      email: params.email,
      lastSeenAt: new Date(),
    },
    update: {
      userId: params.callerUserId,
      email: params.email,
      lastSeenAt: new Date(),
    },
  })

  // Detect any conflicting identity with the same externalUserId but different userId.
  const conflict = await prisma.externalIdentity.findFirst({
    where: {
      externalSystem,
      externalUserId: params.externalUserId,
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
  const existingLink = await prisma.campaignExternalLink.findFirst({
    where: { campaignId: params.campaignId, externalSystem },
    select: { id: true },
  })

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
