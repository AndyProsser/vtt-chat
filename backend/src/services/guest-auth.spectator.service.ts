import { getPrismaClient } from '@/infra/db'
import { createToken } from '@/services/auth.service'
import {
  randomOpaqueToken,
  sanitizeEmail,
  sanitizeInviteCode,
  slugify,
} from '@/utils/guest-auth.helpers'
import type {
  BrowseCampaignResult,
  GuestSpectatorJoinResult,
  SpectatorPromotionResult,
  SpectatorWaitlistStatusResult,
} from '@/types/guest-auth.types'
import type { UUID } from '@shared'

const prisma = getPrismaClient()

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

async function findOrCreateGuestSpectator(params: { email: string; displayName: string }): Promise<{
  id: string
  username: string
  displayName: string
  authType: 'GUEST' | 'FULL'
}> {
  const existing = await prisma.user.findFirst({
    where: { email: params.email },
    select: {
      id: true,
      username: true,
      displayName: true,
      authType: true,
    },
  })

  if (existing && existing.authType === 'FULL') {
    return {
      id: existing.id,
      username: existing.username,
      displayName: existing.displayName,
      authType: 'FULL',
    }
  }

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        displayName: params.displayName,
        role: 'SPECTATOR',
        authType: 'GUEST',
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        authType: true,
      },
    })
  }

  return prisma.user.create({
    data: {
      email: params.email,
      username: await generateUniqueUsername(params.displayName, params.email),
      displayName: params.displayName,
      role: 'SPECTATOR',
      authType: 'GUEST',
      isActive: true,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      authType: true,
    },
  })
}

export async function joinGuestSpectatorViaInvite(params: {
  spectatorInviteCode: string
  email: string
  displayName: string
}): Promise<GuestSpectatorJoinResult> {
  const inviteCode = sanitizeInviteCode(params.spectatorInviteCode)
  const email = sanitizeEmail(params.email)
  const displayName = params.displayName.trim()

  const campaign = await prisma.campaign.findFirst({
    where: {
      spectatorInviteCode: inviteCode,
      spectatorInviteActive: true,
    },
    select: {
      id: true,
      spectatorPolicy: true,
      spectatorMax: true,
      spectatorWaitlistEnabled: true,
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
    },
  })

  if (!campaign) {
    throw new Error('INVITE_EXPIRED')
  }

  if (campaign.spectatorPolicy === 'NONE') {
    throw new Error('SPECTATORS_DISABLED')
  }

  if (campaign.spectatorPolicy === 'USERS') {
    throw new Error('FULL_ACCOUNT_REQUIRED')
  }

  const spectatorUser = await findOrCreateGuestSpectator({
    email,
    displayName,
  })

  const existingWaitlist = await prisma.spectatorWaitlist.findUnique({
    where: {
      campaignId_userId: {
        campaignId: campaign.id,
        userId: spectatorUser.id,
      },
    },
    select: {
      waitlistToken: true,
      promoted: true,
    },
  })

  const activeSession = campaign.sessions[0] || null
  const spectatorSlotsMax = campaign.spectatorMax ?? 5
  const currentFilled = activeSession?.members.length || 0

  if (!activeSession || currentFilled >= spectatorSlotsMax) {
    if (!campaign.spectatorWaitlistEnabled) {
      throw new Error('SPECTATOR_CAPACITY_REACHED')
    }

    const entry =
      existingWaitlist ||
      (await prisma.spectatorWaitlist.create({
        data: {
          campaignId: campaign.id,
          userId: spectatorUser.id,
          waitlistToken: randomOpaqueToken(),
        },
        select: {
          waitlistToken: true,
          joinedAt: true,
        },
      }))

    const waitlistWithJoinTime =
      'joinedAt' in entry
        ? entry
        : await prisma.spectatorWaitlist.findUnique({
            where: {
              campaignId_userId: {
                campaignId: campaign.id,
                userId: spectatorUser.id,
              },
            },
            select: {
              waitlistToken: true,
              joinedAt: true,
            },
          })

    if (!waitlistWithJoinTime) {
      throw new Error('WAITLIST_LOOKUP_FAILED')
    }

    const position = await prisma.spectatorWaitlist.count({
      where: {
        campaignId: campaign.id,
        promoted: false,
        joinedAt: {
          lte: waitlistWithJoinTime.joinedAt,
        },
      },
    })

    return {
      joined: false,
      waitlist: {
        enabled: true,
        waitlistToken: waitlistWithJoinTime.waitlistToken,
        position,
      },
      campaignId: campaign.id,
    }
  }

  await prisma.campaignMembership.upsert({
    where: {
      campaignId_userId: {
        campaignId: campaign.id,
        userId: spectatorUser.id,
      },
    },
    create: {
      campaignId: campaign.id,
      userId: spectatorUser.id,
      role: 'SPECTATOR',
    },
    update: {
      role: 'SPECTATOR',
    },
  })

  await prisma.sessionMember.upsert({
    where: {
      sessionId_userId: {
        sessionId: activeSession.id,
        userId: spectatorUser.id,
      },
    },
    create: {
      sessionId: activeSession.id,
      userId: spectatorUser.id,
      username: spectatorUser.username,
      role: 'SPECTATOR',
    },
    update: {
      role: 'SPECTATOR',
      username: spectatorUser.username,
    },
  })

  if (existingWaitlist && !existingWaitlist.promoted) {
    await prisma.spectatorWaitlist.update({
      where: {
        campaignId_userId: {
          campaignId: campaign.id,
          userId: spectatorUser.id,
        },
      },
      data: {
        promoted: true,
        promotedAt: new Date(),
      },
    })
  }

  return {
    joined: true,
    token: createToken({
      userId: spectatorUser.id as UUID,
      username: spectatorUser.username,
      role: 'SPECTATOR',
      authType: spectatorUser.authType,
    }),
    user: {
      id: spectatorUser.id,
      username: spectatorUser.username,
      displayName: spectatorUser.displayName,
      role: 'SPECTATOR',
      authType: spectatorUser.authType,
    },
    campaignId: campaign.id,
  }
}

export async function getSpectatorWaitlistStatus(params: {
  campaignId: string
  waitlistToken: string
}): Promise<SpectatorWaitlistStatusResult> {
  const waitlistToken = params.waitlistToken.trim()
  const entry = await prisma.spectatorWaitlist.findFirst({
    where: {
      campaignId: params.campaignId,
      waitlistToken,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          authType: true,
        },
      },
    },
  })

  if (!entry) {
    return {
      campaignId: params.campaignId,
      status: 'NOT_FOUND',
    }
  }

  if (entry.promoted) {
    return {
      campaignId: params.campaignId,
      status: 'PROMOTED',
      token: createToken({
        userId: entry.user.id as UUID,
        username: entry.user.username,
        role: 'SPECTATOR',
        authType: entry.user.authType,
      }),
      user: {
        id: entry.user.id,
        username: entry.user.username,
        displayName: entry.user.displayName,
        role: 'SPECTATOR',
        authType: entry.user.authType,
      },
    }
  }

  const position =
    (await prisma.spectatorWaitlist.count({
      where: {
        campaignId: params.campaignId,
        promoted: false,
        joinedAt: {
          lte: entry.joinedAt,
        },
      },
    })) || 1

  return {
    campaignId: params.campaignId,
    status: 'WAITLISTED',
    position,
  }
}

export async function browseSpectatorCampaignsForUser(params: {
  userId: string
}): Promise<BrowseCampaignResult[]> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      authType: true,
    },
  })

  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }

  if (user.authType !== 'FULL') {
    throw new Error('FULL_ACCOUNT_REQUIRED')
  }

  const campaigns = await prisma.campaign.findMany({
    select: {
      id: true,
      name: true,
      discoverable: true,
      spectatorPolicy: true,
      spectatorMax: true,
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
    },
    orderBy: {
      name: 'asc',
    },
  })

  return campaigns.map((campaign) => {
    const slotsMax = campaign.spectatorMax ?? 5
    const slotsFilled = campaign.sessions[0]?.members.length || 0
    const isPrivate = !campaign.discoverable || campaign.spectatorPolicy === 'NONE'

    return {
      campaignId: campaign.id,
      name: campaign.name,
      dmDisplayName: campaign.currentDm.displayName || campaign.currentDm.username,
      sessionActive: Boolean(campaign.sessions[0]),
      spectatorPolicy: campaign.spectatorPolicy,
      private: isPrivate,
      spectatorSlotsFilled: slotsFilled,
      spectatorSlotsMax: slotsMax,
      joinEnabled: !isPrivate,
    }
  })
}

export async function promoteNextWaitlistedSpectatorForSession(
  sessionId: string
): Promise<SpectatorPromotionResult> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      campaignId: true,
      members: {
        where: {
          role: 'SPECTATOR',
        },
        select: {
          id: true,
        },
      },
      campaign: {
        select: {
          id: true,
          spectatorMax: true,
          spectatorWaitlistEnabled: true,
        },
      },
    },
  })

  if (!session?.campaignId || !session.campaign?.spectatorWaitlistEnabled) {
    return { promoted: false }
  }

  const spectatorSlotsMax = session.campaign.spectatorMax ?? 5
  if (session.members.length >= spectatorSlotsMax) {
    return { promoted: false }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextEntry = await prisma.spectatorWaitlist.findFirst({
      where: {
        campaignId: session.campaignId,
        promoted: false,
      },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    })

    if (!nextEntry) {
      return { promoted: false }
    }

    const claimed = await prisma.spectatorWaitlist.updateMany({
      where: {
        id: nextEntry.id,
        promoted: false,
      },
      data: {
        promoted: true,
        promotedAt: new Date(),
      },
    })

    if (claimed.count === 0) {
      continue
    }

    await prisma.campaignMembership.upsert({
      where: {
        campaignId_userId: {
          campaignId: session.campaignId,
          userId: nextEntry.user.id,
        },
      },
      create: {
        campaignId: session.campaignId,
        userId: nextEntry.user.id,
        role: 'SPECTATOR',
      },
      update: {
        role: 'SPECTATOR',
      },
    })

    await prisma.sessionMember.upsert({
      where: {
        sessionId_userId: {
          sessionId,
          userId: nextEntry.user.id,
        },
      },
      create: {
        sessionId,
        userId: nextEntry.user.id,
        username: nextEntry.user.username,
        role: 'SPECTATOR',
      },
      update: {
        role: 'SPECTATOR',
        username: nextEntry.user.username,
      },
    })

    return {
      promoted: true,
      campaignId: session.campaignId,
      sessionId,
      waitlistToken: nextEntry.waitlistToken,
      user: {
        id: nextEntry.user.id,
        username: nextEntry.user.username,
        displayName: nextEntry.user.displayName,
        role: 'SPECTATOR',
        authType: 'GUEST',
      },
    }
  }

  return { promoted: false }
}
