import { getPrismaClient } from '@/infra/db'
import type { TokenPayload } from '@/services/auth.service'
import {
  sanitizeEmail,
  sanitizeExternalSystem,
  sanitizeInviteCode,
} from '@/utils/guest-auth.helpers'
import type {
  InviteValidationResult,
  PlatformStatus,
  PreflightResult,
  SpectatorCharacterSummary,
  SpectatorInviteValidationResult,
} from '@/types/guest-auth.types'

const prisma = getPrismaClient()

export async function getPlatformStatus(): Promise<PlatformStatus> {
  const [activeUsers, activeCampaigns, activeSessions] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.campaign.count(),
    prisma.session.count({ where: { state: 'ACTIVE' } }),
  ])

  return {
    online: true,
    version: '0.5.3',
    activeUsers,
    activeCampaigns,
    activeSessions,
    maintenanceMode: false,
  }
}

export async function validatePlayerInviteCode(
  inviteCode: string
): Promise<InviteValidationResult> {
  const campaign = await prisma.campaign.findFirst({
    where: {
      inviteCode: sanitizeInviteCode(inviteCode),
      inviteActive: true,
    },
    select: {
      id: true,
      name: true,
      currentDm: {
        select: {
          displayName: true,
          username: true,
        },
      },
    },
  })

  if (!campaign) {
    return {
      valid: false,
      reason: 'INVITE_EXPIRED',
    }
  }

  return {
    valid: true,
    type: 'player',
    campaign: {
      id: campaign.id,
      name: campaign.name,
      dmDisplayName: campaign.currentDm.displayName || campaign.currentDm.username,
    },
    platformStatus: await getPlatformStatus(),
  }
}

export async function validateSpectatorInviteCode(
  inviteCode: string
): Promise<SpectatorInviteValidationResult> {
  const normalizedCode = sanitizeInviteCode(inviteCode)
  const campaign = await prisma.campaign.findFirst({
    where: {
      spectatorInviteCode: normalizedCode,
      spectatorInviteActive: true,
    },
    select: {
      id: true,
      name: true,
      spectatorPolicy: true,
      spectatorMax: true,
      spectatorWaitlistEnabled: true,
      currentDm: {
        select: {
          displayName: true,
          username: true,
        },
      },
      sessions: {
        where: {
          state: 'ACTIVE',
        },
        select: {
          id: true,
          members: {
            where: {
              role: 'SPECTATOR',
            },
            select: {
              id: true,
            },
          },
        },
        take: 1,
      },
      characters: {
        select: {
          name: true,
          class: true,
          avatarUrl: true,
          metadata: true,
          userId: true,
        },
        orderBy: {
          name: 'asc',
        },
      },
    },
  })

  if (!campaign) {
    return {
      valid: false,
      reason: 'INVITE_EXPIRED',
    }
  }

  const activeSession = campaign.sessions[0] || null
  const slotsFilled = activeSession?.members.length || 0
  const slotsMax = campaign.spectatorMax ?? 5

  const onlineUsers = activeSession
    ? new Set(
        (
          await prisma.presenceSnapshot.findMany({
            where: {
              sessionId: activeSession.id,
              state: {
                not: 'OFFLINE',
              },
            },
            select: {
              userId: true,
            },
          })
        ).map((item) => item.userId)
      )
    : new Set<string>()

  const characters: SpectatorCharacterSummary[] = campaign.characters.map((character) => {
    const metadata = (character.metadata as Record<string, unknown> | null) || null
    const levelValue = metadata?.level
    return {
      name: character.name,
      class: character.class,
      level: typeof levelValue === 'number' ? levelValue : null,
      avatarUrl: character.avatarUrl,
      online: onlineUsers.has(character.userId),
    }
  })

  return {
    valid: true,
    type: 'spectator',
    campaign: {
      id: campaign.id,
      name: campaign.name,
      dmDisplayName: campaign.currentDm.displayName || campaign.currentDm.username,
      sessionActive: Boolean(activeSession),
      spectatorSlotsFilled: slotsFilled,
      spectatorSlotsMax: slotsMax,
      spectatorWaitlistEnabled: campaign.spectatorWaitlistEnabled,
      spectatorPolicy: campaign.spectatorPolicy,
    },
    characters,
  }
}

export async function getExtensionPreflight(params: {
  email: string
  externalSystem: string
  externalUserId?: string
  inviteCode: string
  currentUser?: TokenPayload | null
}): Promise<PreflightResult> {
  const invite = await validatePlayerInviteCode(params.inviteCode)
  if (!invite.valid) {
    throw new Error('INVITE_EXPIRED')
  }

  const email = sanitizeEmail(params.email)
  const externalSystem = sanitizeExternalSystem(params.externalSystem)
  const externalUserId = String(params.externalUserId || '').trim()

  const externalIdentity = externalUserId
    ? await prisma.externalIdentity.findUnique({
        where: {
          externalSystem_externalUserId: {
            externalSystem,
            externalUserId,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              authType: true,
            },
          },
        },
      })
    : null

  const user =
    externalIdentity?.user ||
    (await prisma.user.findFirst({
      where: { email },
      select: { id: true, authType: true },
    }))

  if (!user) {
    return {
      accountStatus: 'none',
      suggestedFlow: 'guest',
    }
  }

  if (user.authType === 'GUEST') {
    return {
      accountStatus: 'guest',
      suggestedFlow: 'auto-login',
    }
  }

  return {
    accountStatus: 'full',
    suggestedFlow:
      params.currentUser?.userId === user.id ? 'already-authenticated' : 'authenticate',
  }
}
