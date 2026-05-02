import { getPrismaClient } from '@/infra/db'
import { createToken, hashPassword } from '@/services/auth.service'
import {
  sanitizeEmail,
  sanitizeExternalSystem,
  sanitizeInviteCode,
  slugify,
} from '@/utils/guest-auth.helpers'
import type { GuestCharacterInput, GuestLoginInput } from '@/types/guest-auth.types'
import { validatePassword } from '@/utils/password'
import type { UUID } from '@shared'

const prisma = getPrismaClient()

export * from '@/types/guest-auth.types'
export {
  getExtensionPreflight,
  getPlatformStatus,
  validatePlayerInviteCode,
  validateSpectatorInviteCode,
} from '@/services/guest-auth.discovery.service'
export {
  browseSpectatorCampaignsForUser,
  getSpectatorWaitlistStatus,
  joinGuestSpectatorViaInvite,
  promoteNextWaitlistedSpectatorForSession,
} from '@/services/guest-auth.spectator.service'

async function generateUniqueUsername(displayName: string, email: string): Promise<string> {
  const emailBase = email.split('@')[0] || 'guest'
  const base = slugify(displayName || emailBase || 'guest').slice(0, 24) || 'guest'

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 6)
    const candidate = attempt === 0 ? `${base}-${suffix}` : `${base}-${attempt}${suffix}`
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    })

    if (!existing) {
      return candidate
    }
  }

  return `${base}-${Date.now().toString(36)}`
}

async function findOrCreateGuestUser(params: {
  email: string
  displayName: string
  avatarUrl?: string
  role: 'DM' | 'PLAYER'
}): Promise<{
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}> {
  const existing = await prisma.user.findFirst({
    where: { email: params.email },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      authType: true,
      adminRole: true,
    },
  })

  if (existing && existing.authType === 'FULL') {
    throw new Error('FULL_ACCOUNT_EXISTS')
  }

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        displayName: params.displayName,
        avatarUrl: params.avatarUrl ?? undefined,
        role: params.role,
        authType: 'GUEST',
        isActive: true,
        adminRole: params.role === 'DM' ? existing.adminRole || 'CAMPAIGN_DM' : existing.adminRole,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    })
  }

  return prisma.user.create({
    data: {
      email: params.email,
      username: await generateUniqueUsername(params.displayName, params.email),
      displayName: params.displayName,
      avatarUrl: params.avatarUrl,
      role: params.role,
      authType: 'GUEST',
      adminRole: params.role === 'DM' ? 'CAMPAIGN_DM' : null,
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  })
}

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

  const metadata = {
    level: params.character.level ?? null,
    characterUrl: params.character.characterUrl || null,
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
  const user = await findOrCreateGuestUser({
    email,
    displayName: String(params.displayName || email.split('@')[0] || 'Guest').trim(),
    avatarUrl: params.avatarUrl,
    role,
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

export async function upgradeGuestAccount(params: { userId: string; password: string }): Promise<{
  token: string
  user: {
    id: string
    username: string
    role: 'DM' | 'PLAYER' | 'SPECTATOR'
    authType: 'FULL'
  }
}> {
  const passwordResult = validatePassword(params.password)
  if (!passwordResult.isValid) {
    throw new Error('INVALID_PASSWORD')
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      username: true,
      role: true,
      authType: true,
    },
  })

  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }

  if (user.authType !== 'GUEST') {
    throw new Error('ACCOUNT_ALREADY_FULL')
  }

  const updated = await prisma.user.update({
    where: { id: params.userId },
    data: {
      authType: 'FULL',
      password: await hashPassword(params.password),
    },
    select: {
      id: true,
      username: true,
      role: true,
    },
  })

  if (!['DM', 'PLAYER', 'SPECTATOR'].includes(updated.role)) {
    throw new Error('INVALID_ROLE')
  }

  return {
    token: createToken({
      userId: updated.id as UUID,
      username: updated.username,
      role: updated.role as 'DM' | 'PLAYER' | 'SPECTATOR',
      authType: 'FULL',
    }),
    user: {
      id: updated.id,
      username: updated.username,
      role: updated.role as 'DM' | 'PLAYER' | 'SPECTATOR',
      authType: 'FULL',
    },
  }
}
