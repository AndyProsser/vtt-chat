import { getPrismaClient } from '@/infra/db'
import { createToken } from '@/services/auth.service'
import { createCharacterForCampaign } from '@/repositories/campaign.repository'
import { findOrCreateGuestAccount } from '@/services/guest-account.service'
import {
  sanitizeEmail,
  sanitizeExternalSystem,
  sanitizeInviteCode,
} from '@/utils/guest-auth.helpers'
import type { GuestCharacterInput, GuestLoginInput } from '@/types/guest-auth.types'
import type { UUID } from '@shared'
import { externalSystemToPlatform } from '@/services/integrations.service'

const prisma = getPrismaClient()

async function upsertExternalIdentity(params: {
  userId: string
  externalSystem: string
  externalUserId: string
  email: string
}): Promise<void> {
  await prisma.externalIdentity.upsert({
    where: {
      externalSystem_externalUserId: {
        externalSystem: params.externalSystem,
        externalUserId: params.externalUserId,
      },
    },
    create: {
      userId: params.userId,
      externalSystem: params.externalSystem,
      externalUserId: params.externalUserId,
      email: params.email,
      lastSeenAt: new Date(),
    },
    update: {
      userId: params.userId,
      email: params.email,
      lastSeenAt: new Date(),
    },
  })
}

async function upsertCharacter(params: {
  campaignId: string
  userId: string
  externalSystem: string
  character: GuestCharacterInput
}): Promise<{ id: string; name: string; avatarUrl: string | null }> {
  const externalId = String(params.character.externalCharacterId || '').trim() || null
  const existing = externalId
    ? await prisma.character.findFirst({
        where: {
          campaignId: params.campaignId,
          externalSystem: params.externalSystem,
          externalId,
        },
        select: { id: true },
      })
    : null

  const metadata: Record<string, unknown> = {
    level: params.character.level ?? null,
    characterUrl: params.character.characterUrl || null,
  }

  if (params.character.stats !== undefined) {
    metadata.stats = params.character.stats
  }
  if (params.character.conditions !== undefined) {
    metadata.conditions = params.character.conditions
  }
  if (params.character.features !== undefined) {
    metadata.features = params.character.features
  }

  if (existing) {
    return prisma.character.update({
      where: { id: existing.id },
      data: {
        userId: params.userId,
        name: params.character.name.trim(),
        race: params.character.race?.trim(),
        class: params.character.class?.trim(),
        subclass: params.character.subclass?.trim(),
        avatarUrl: params.character.avatarUrl?.trim(),
        externalSystem: params.externalSystem,
        externalId: externalId || undefined,
        metadata,
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
      },
    })
  }

  return prisma.character.create({
    data: {
      campaignId: params.campaignId,
      userId: params.userId,
      name: params.character.name.trim(),
      race: params.character.race?.trim(),
      class: params.character.class?.trim(),
      subclass: params.character.subclass?.trim(),
      avatarUrl: params.character.avatarUrl?.trim(),
      externalSystem: params.externalSystem,
      externalId: externalId || undefined,
      metadata,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  })
}

export async function loginGuestViaExtension(params: GuestLoginInput): Promise<{
  token: string
  user: {
    id: string
    displayName: string
    avatarUrl: string | null
    authType: 'GUEST'
    campaignId: string
    role: 'DM' | 'PLAYER'
  }
  character: {
    id: string
    name: string
    avatarUrl: string | null
  } | null
  campaignBootstrapped: boolean
}> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      inviteCode: sanitizeInviteCode(params.inviteCode),
      inviteActive: true,
    },
    select: {
      id: true,
      currentDmId: true,
      supportedPlatforms: true,
      externalLinks: {
        where: { externalSystem: sanitizeExternalSystem(params.externalSystem) },
        select: { id: true, externalId: true },
        take: 1,
      },
    },
  })

  if (!campaign) {
    throw new Error('INVITE_EXPIRED')
  }

  const externalSystem = sanitizeExternalSystem(params.externalSystem)

  // Enforce campaign-level platform gate before doing any account work.
  const platformKey = externalSystemToPlatform(externalSystem)
  const campaignAllowsPlatform =
    campaign.supportedPlatforms.includes('ANY' as never) ||
    (platformKey !== null && campaign.supportedPlatforms.includes(platformKey as never))
  if (!campaignAllowsPlatform) {
    throw new Error('PLATFORM_NOT_AUTHORIZED')
  }
  const externalUserId = String(params.externalUserId || '').trim()
  const link = campaign.externalLinks[0] || null

  if (!link && !params.campaignPacket?.externalCampaignId) {
    throw new Error('CAMPAIGN_PACKET_REQUIRED')
  }

  if (
    link &&
    params.campaignPacket?.externalCampaignId &&
    link.externalId !== params.campaignPacket.externalCampaignId.trim()
  ) {
    throw new Error('CAMPAIGN_LINK_MISMATCH')
  }

  const role: 'DM' | 'PLAYER' =
    params.campaignPacket?.dmExternalUserId?.trim() === externalUserId ? 'DM' : 'PLAYER'
  const email = sanitizeEmail(params.email)
  const user = await findOrCreateGuestAccount({
    email,
    displayName: String(params.displayName || email.split('@')[0] || 'Guest').trim(),
    avatarUrl: params.avatarUrl,
    role,
    fullAccountPolicy: 'reject',
  })

  if (!link && params.campaignPacket?.externalCampaignId) {
    await prisma.campaignExternalLink.create({
      data: {
        campaignId: campaign.id,
        externalSystem,
        externalId: params.campaignPacket.externalCampaignId.trim(),
        linkedBy: user.id,
      },
    })
  }

  if (role === 'DM' && campaign.currentDmId !== user.id) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { currentDmId: user.id },
    })
  }

  await prisma.campaignMembership.upsert({
    where: {
      campaignId_userId: {
        campaignId: campaign.id,
        userId: user.id,
      },
    },
    create: {
      campaignId: campaign.id,
      userId: user.id,
      role,
    },
    update: {
      role,
    },
  })

  await upsertExternalIdentity({
    userId: user.id,
    externalSystem,
    externalUserId,
    email,
  })

  const character = params.character
    ? await upsertCharacter({
        campaignId: campaign.id,
        userId: user.id,
        externalSystem,
        character: params.character,
      })
    : null

  return {
    token: createToken({
      userId: user.id as UUID,
      username: user.username,
      role,
      authType: 'GUEST',
    }),
    user: {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      authType: 'GUEST',
      campaignId: campaign.id,
      role,
    },
    character,
    campaignBootstrapped: !link,
  }
}
