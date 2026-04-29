import { getPrismaClient } from '@/infra/db'
import { createToken, hashPassword, type TokenPayload } from '@/services/auth.service'
import { validatePassword } from '@/utils/password'
import type { UUID } from '@shared'
import { randomBytes } from 'crypto'

const prisma = getPrismaClient()

export type PlatformStatus = {
  online: boolean
  version: string
  activeUsers: number
  activeCampaigns: number
  activeSessions: number
  maintenanceMode: boolean
}

export type InviteValidationResult =
  | {
      valid: true
      type: 'player'
      campaign: {
        id: string
        name: string
        dmDisplayName: string
      }
      platformStatus: PlatformStatus
    }
  | {
      valid: false
      reason: 'INVITE_EXPIRED'
    }

export type PreflightResult =
  | { accountStatus: 'none'; suggestedFlow: 'guest' }
  | { accountStatus: 'guest'; suggestedFlow: 'auto-login' }
  | { accountStatus: 'full'; suggestedFlow: 'authenticate' | 'already-authenticated' }

type GuestCharacterInput = {
  name: string
  race?: string
  class?: string
  subclass?: string
  level?: number
  externalCharacterId?: string
  characterUrl?: string
  avatarUrl?: string
}

type GuestCampaignPacket = {
  externalCampaignId?: string
  dmExternalUserId?: string
}

type SpectatorCharacterSummary = {
  name: string
  class: string | null
  level: number | null
  avatarUrl: string | null
  online: boolean
}

export type SpectatorInviteValidationResult =
  | {
      valid: true
      type: 'spectator'
      campaign: {
        id: string
        name: string
        dmDisplayName: string
        sessionActive: boolean
        spectatorSlotsFilled: number
        spectatorSlotsMax: number
        spectatorWaitlistEnabled: boolean
        spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
      }
      characters: SpectatorCharacterSummary[]
    }
  | {
      valid: false
      reason: 'INVITE_EXPIRED'
    }

export type GuestLoginInput = {
  inviteCode: string
  externalSystem: string
  externalUserId: string
  email: string
  displayName?: string
  avatarUrl?: string
  character?: GuestCharacterInput
  campaignPacket?: GuestCampaignPacket
}

export type GuestSpectatorJoinResult =
  | {
      joined: true
      token: string
      user: {
        id: string
        username: string
        displayName: string
        role: 'SPECTATOR'
        authType: 'GUEST'
      }
      campaignId: string
    }
  | {
      joined: false
      waitlist: {
        enabled: true
        waitlistToken: string
        position: number
      }
      campaignId: string
    }

export type SpectatorWaitlistStatusResult = {
  campaignId: string
  status: 'WAITLISTED' | 'PROMOTED' | 'NOT_FOUND'
  position?: number
  token?: string
  user?: {
    id: string
    username: string
    displayName: string
    role: 'SPECTATOR'
    authType: 'GUEST'
  }
}

export type BrowseCampaignResult = {
  campaignId: string
  name: string
  dmDisplayName: string
  sessionActive: boolean
  spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
  private: boolean
  spectatorSlotsFilled: number
  spectatorSlotsMax: number
  joinEnabled: boolean
}

export type SpectatorPromotionResult =
  | {
      promoted: true
      campaignId: string
      sessionId: string
      waitlistToken: string
      user: {
        id: string
        username: string
        displayName: string
        role: 'SPECTATOR'
        authType: 'GUEST'
      }
    }
  | {
      promoted: false
    }

function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function sanitizeInviteCode(inviteCode: string): string {
  return inviteCode.trim().toUpperCase()
}

function sanitizeExternalSystem(externalSystem: string): string {
  return externalSystem.trim().toLowerCase()
}

function randomOpaqueToken(bytes = 18): string {
  return randomBytes(bytes).toString('base64url')
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

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

async function findOrCreateGuestSpectator(params: { email: string; displayName: string }): Promise<{
  id: string
  username: string
  displayName: string
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
      authType: 'GUEST',
    }),
    user: {
      id: spectatorUser.id,
      username: spectatorUser.username,
      displayName: spectatorUser.displayName,
      role: 'SPECTATOR',
      authType: 'GUEST',
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
        authType: 'GUEST',
      }),
      user: {
        id: entry.user.id,
        username: entry.user.username,
        displayName: entry.user.displayName,
        role: 'SPECTATOR',
        authType: 'GUEST',
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
