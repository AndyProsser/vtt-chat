import { getPrismaClient } from '@/infra/db'
import { createToken } from '@/services/auth.service'
import { createCharacterForCampaign } from '@/repositories/campaign.repository'
import { findOrCreateGuestAccount } from '@/services/guest-account.service'
import { sanitizeEmail, sanitizeInviteCode } from '@/utils/guest-auth.helpers'
import type { UUID } from '@shared'

const prisma = getPrismaClient()

export async function joinGuestPlayerViaInvite(params: {
  inviteCode: string
  email: string
  displayName: string
  character?: {
    name: string
    race?: string
    class?: string
    level?: number | null
    avatarUrl?: string
  }
}): Promise<{
  joined: true
  token: string
  user: {
    id: string
    username: string
    role: 'PLAYER'
    authType: 'GUEST'
    displayName: string
  }
  campaignId: string
  character?: {
    id: string
    name: string
    avatarUrl: string | null
  }
}> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      inviteCode: sanitizeInviteCode(params.inviteCode),
      inviteActive: true,
    },
    select: {
      id: true,
    },
  })

  if (!campaign) {
    throw new Error('INVITE_EXPIRED')
  }

  const email = sanitizeEmail(params.email)
  const displayName = String(params.displayName || '').trim() || email.split('@')[0] || 'Guest'

  const user = await findOrCreateGuestAccount({
    email,
    displayName,
    role: 'PLAYER',
    fullAccountPolicy: 'reject',
  })

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
      role: 'PLAYER',
    },
    update: {
      role: 'PLAYER',
    },
  })

  const existingCharacter = await prisma.character.findFirst({
    where: {
      campaignId: campaign.id,
      userId: user.id,
    },
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      name: true,
      race: true,
      class: true,
      avatarUrl: true,
      metadata: true,
    },
  })

  let character:
    | {
        id: string
        name: string
        avatarUrl: string | null
      }
    | undefined

  const characterName = String(params.character?.name || '').trim()
  if (characterName) {
    const levelValue =
      typeof params.character?.level === 'number' && Number.isFinite(params.character.level)
        ? Math.max(1, Math.min(20, Math.round(params.character.level)))
        : null

    character = await createCharacterForCampaign({
      campaignId: campaign.id,
      userId: user.id,
      name: characterName,
      race: params.character?.race?.trim() || undefined,
      class: params.character?.class?.trim() || undefined,
      avatarUrl: params.character?.avatarUrl?.trim() || undefined,
      metadata: levelValue != null ? { level: levelValue } : undefined,
      isActive: true,
    })
  } else if (existingCharacter) {
    const existingMetadata =
      (existingCharacter.metadata as Record<string, unknown> | null) ?? undefined
    const existingLevel =
      typeof existingMetadata?.level === 'number' && Number.isFinite(existingMetadata.level)
        ? Math.max(1, Math.min(20, Math.round(existingMetadata.level)))
        : null

    character = await createCharacterForCampaign({
      campaignId: campaign.id,
      userId: user.id,
      name: existingCharacter.name,
      race: existingCharacter.race || undefined,
      class: existingCharacter.class || undefined,
      avatarUrl: existingCharacter.avatarUrl || undefined,
      metadata: existingLevel != null ? { level: existingLevel } : undefined,
      isActive: true,
    })
  }

  return {
    joined: true,
    token: createToken({
      userId: user.id as UUID,
      username: user.username,
      role: 'PLAYER',
      authType: 'GUEST',
    }),
    user: {
      id: user.id,
      username: user.username,
      role: 'PLAYER',
      authType: 'GUEST',
      displayName: user.displayName,
    },
    campaignId: campaign.id,
    ...(character ? { character } : {}),
  }
}

export async function precheckPlayerInviteEmail(params: {
  inviteCode: string
  email: string
}): Promise<{
  campaignId: string
  accountStatus: 'none' | 'guest' | 'full'
  guestProfile?: {
    displayName: string
  }
  existingCharacter?: {
    name: string
    race: string | null
    class: string | null
    level: number | null
    avatarUrl: string | null
  }
}> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      inviteCode: sanitizeInviteCode(params.inviteCode),
      inviteActive: true,
    },
    select: {
      id: true,
    },
  })

  if (!campaign) {
    throw new Error('INVITE_EXPIRED')
  }

  const normalizedEmail = sanitizeEmail(params.email)
  const user = await prisma.user.findFirst({
    where: {
      email: normalizedEmail,
    },
    select: {
      id: true,
      authType: true,
      displayName: true,
    },
  })

  if (!user) {
    return {
      campaignId: campaign.id,
      accountStatus: 'none',
    }
  }

  if (user.authType === 'FULL') {
    return {
      campaignId: campaign.id,
      accountStatus: 'full',
    }
  }

  const existingCharacter = await prisma.character.findFirst({
    where: {
      campaignId: campaign.id,
      userId: user.id,
    },
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    select: {
      name: true,
      race: true,
      class: true,
      avatarUrl: true,
      metadata: true,
    },
  })

  const existingMetadata =
    (existingCharacter?.metadata as Record<string, unknown> | null) ?? undefined
  const existingLevel =
    typeof existingMetadata?.level === 'number' && Number.isFinite(existingMetadata.level)
      ? Math.max(1, Math.min(20, Math.round(existingMetadata.level)))
      : null

  return {
    campaignId: campaign.id,
    accountStatus: 'guest',
    guestProfile: {
      displayName: String(user.displayName || '').trim(),
    },
    existingCharacter: existingCharacter
      ? {
          name: existingCharacter.name,
          race: existingCharacter.race,
          class: existingCharacter.class,
          level: existingLevel,
          avatarUrl: existingCharacter.avatarUrl,
        }
      : undefined,
  }
}
