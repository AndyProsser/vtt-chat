import { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

type CampaignDisplayState = 'INACTIVE' | 'GREENROOM' | 'ACTIVE' | 'PAUSED'

function roundPresenceCountForPrivacy(count: number): number {
  if (count <= 0) return 0
  if (count <= 2) return count
  if (count <= 5) return 5
  if (count <= 20) return Math.ceil(count / 5) * 5
  return Math.ceil(count / 10) * 10
}

function toPresenceCountLabel(count: number, rounded: number): string {
  if (count <= 0) return '0'
  if (count <= 2) return String(count)
  return `~${rounded}`
}

function deriveCampaignDisplayState(
  latestSessionState: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | null
): CampaignDisplayState {
  if (!latestSessionState) return 'INACTIVE'
  if (latestSessionState === 'ACTIVE') return 'ACTIVE'
  if (latestSessionState === 'PAUSED') return 'PAUSED'
  return 'GREENROOM'
}

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function upsertUserAccount(params: {
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR'
  displayName?: string
  avatarUrl?: string
}): Promise<{
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  createdAt: Date
}> {
  const user = await prisma.user.upsert({
    where: { username: params.username },
    create: {
      username: params.username,
      displayName: params.displayName || params.username,
      avatarUrl: params.avatarUrl,
      role: params.role,
    },
    update: {
      role: params.role,
      displayName: params.displayName || params.username,
      avatarUrl: params.avatarUrl ?? undefined,
    },
  })

  if (params.role === 'DM') {
    await prisma.user.updateMany({
      where: {
        id: user.id,
        adminRole: null,
      },
      data: {
        adminRole: 'CAMPAIGN_DM',
      },
    })
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt,
  }
}

export async function getUserProfileById(userId: string): Promise<{
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  createdAt: Date
} | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt,
  }
}

export async function listCampaignsForUser(userId: string): Promise<
  Array<{
    id: string
    name: string
    description: string | null
    posterUrl: string | null
    inviteCode: string
    currentDmId: string
    memberRole: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
    latestSessionState: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | null
    displayState: CampaignDisplayState
    dmOnline: boolean
    connectedPlayers: number
    connectedPlayersRounded: number
    connectedPlayersLabel: string
    connectedSpectators: number
    connectedSpectatorsRounded: number
    connectedSpectatorsLabel: string
    dmUsername: string
    dmDisplayName: string
    dmAvatarUrl: string | null
    createdAt: Date
    updatedAt: Date
  }>
> {
  const memberships = await prisma.campaignMembership.findMany({
    where: { userId },
    include: {
      campaign: {
        include: {
          currentDm: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          members: {
            select: {
              userId: true,
              role: true,
            },
          },
          sessions: {
            select: {
              state: true,
              presence: {
                select: {
                  userId: true,
                  state: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }],
            take: 1,
          },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  })

  return memberships.map((m: any) => ({
    ...(() => {
      const latestSessionState = (m.campaign.sessions?.[0]?.state || null) as
        | 'IDLE'
        | 'ACTIVE'
        | 'PAUSED'
        | 'ENDED'
        | null

      const latestSessionPresence = (m.campaign.sessions?.[0]?.presence || []) as Array<{
        userId: string
        state: 'ONLINE' | 'IDLE' | 'OFFLINE'
      }>
      const onlineUserIds = new Set(
        latestSessionPresence
          .filter((entry) => entry.state === 'ONLINE')
          .map((entry) => entry.userId)
      )
      const roleByUserId = new Map<string, 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'>(
        (m.campaign.members || []).map((member: { userId: string; role: string }) => [
          member.userId,
          member.role as 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM',
        ])
      )

      const connectedPlayers = Array.from(onlineUserIds).filter(
        (id) => roleByUserId.get(id) === 'PLAYER'
      ).length
      const connectedSpectators = Array.from(onlineUserIds).filter(
        (id) => roleByUserId.get(id) === 'SPECTATOR'
      ).length

      const connectedPlayersRounded = roundPresenceCountForPrivacy(connectedPlayers)
      const connectedSpectatorsRounded = roundPresenceCountForPrivacy(connectedSpectators)

      return {
        latestSessionState,
        displayState: deriveCampaignDisplayState(latestSessionState),
        dmOnline: onlineUserIds.has(m.campaign.currentDmId),
        connectedPlayers,
        connectedPlayersRounded,
        connectedPlayersLabel: toPresenceCountLabel(connectedPlayers, connectedPlayersRounded),
        connectedSpectators,
        connectedSpectatorsRounded,
        connectedSpectatorsLabel: toPresenceCountLabel(
          connectedSpectators,
          connectedSpectatorsRounded
        ),
      }
    })(),
    id: m.campaign.id,
    name: m.campaign.name,
    description: m.campaign.description,
    posterUrl: m.campaign.posterUrl,
    inviteCode: m.campaign.inviteCode,
    currentDmId: m.campaign.currentDmId,
    dmUsername: m.campaign.currentDm?.username || 'dm',
    dmDisplayName: m.campaign.currentDm?.displayName || m.campaign.currentDm?.username || 'DM',
    dmAvatarUrl: m.campaign.currentDm?.avatarUrl || null,
    memberRole: m.role,
    createdAt: m.campaign.createdAt,
    updatedAt: m.campaign.updatedAt,
  }))
}

export async function createCampaignForUser(params: {
  name: string
  description?: string
  currentDmId: string
}): Promise<{
  id: string
  name: string
  description: string | null
  inviteCode: string
  currentDmId: string
  createdAt: Date
  updatedAt: Date
}> {
  const inviteCode = generateInviteCode()

  const campaign = await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: {
        id: params.currentDmId,
      },
      data: {
        role: 'DM',
      },
    })

    await tx.user.updateMany({
      where: {
        id: params.currentDmId,
        adminRole: null,
      },
      data: {
        adminRole: 'CAMPAIGN_DM',
      },
    })

    const created = await tx.campaign.create({
      data: {
        name: params.name,
        description: params.description,
        currentDmId: params.currentDmId,
        inviteCode,
      },
    })

    await tx.campaignMembership.create({
      data: {
        campaignId: created.id,
        userId: params.currentDmId,
        role: 'DM',
      },
    })

    return created
  })

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    inviteCode: campaign.inviteCode,
    currentDmId: campaign.currentDmId,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  }
}

export async function getCampaignForUser(params: { campaignId: string; userId: string }): Promise<{
  id: string
  name: string
  description: string | null
  inviteCode: string
  currentDmId: string
  postSessionChatEnabled: boolean
  postSessionChatDurationMs: number
  latestSessionState: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | null
  latestSessionEndedAt: Date | null
  createdAt: Date
  updatedAt: Date
} | null> {
  const membership = await prisma.campaignMembership.findUnique({
    where: {
      campaignId_userId: {
        campaignId: params.campaignId,
        userId: params.userId,
      },
    },
    include: {
      campaign: {
        include: {
          sessions: {
            select: {
              state: true,
              endedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  if (!membership) return null

  return {
    id: membership.campaign.id,
    name: membership.campaign.name,
    description: membership.campaign.description,
    inviteCode: membership.campaign.inviteCode,
    currentDmId: membership.campaign.currentDmId,
    postSessionChatEnabled: membership.campaign.postSessionChatEnabled,
    postSessionChatDurationMs: membership.campaign.postSessionChatDurationMs,
    latestSessionState: (membership.campaign.sessions[0]?.state || null) as
      | 'IDLE'
      | 'ACTIVE'
      | 'PAUSED'
      | 'ENDED'
      | null,
    latestSessionEndedAt: membership.campaign.sessions[0]?.endedAt || null,
    createdAt: membership.campaign.createdAt,
    updatedAt: membership.campaign.updatedAt,
  }
}

export async function joinCampaignForUser(params: {
  campaignId: string
  userId: string
  inviteCode: string
  role?: 'PLAYER' | 'SPECTATOR'
}): Promise<boolean> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
  })

  if (!campaign || campaign.inviteCode !== params.inviteCode) {
    return false
  }

  await prisma.campaignMembership.upsert({
    where: {
      campaignId_userId: {
        campaignId: params.campaignId,
        userId: params.userId,
      },
    },
    create: {
      campaignId: params.campaignId,
      userId: params.userId,
      role: params.role || 'PLAYER',
    },
    update: {
      role: params.role || 'PLAYER',
    },
  })

  return true
}

export async function createCharacterForCampaign(params: {
  campaignId: string
  userId: string
  name: string
  status?: 'ALIVE' | 'DEAD' | 'LEFT' | 'UNKNOWN'
  race?: string
  class?: string
  subclass?: string
  avatarUrl?: string
  metadata?: Record<string, unknown>
  isActive?: boolean
}): Promise<{
  id: string
  campaignId: string
  userId: string
  name: string
  status: 'ALIVE' | 'DEAD' | 'LEFT' | 'UNKNOWN'
  race: string | null
  class: string | null
  subclass: string | null
  avatarUrl: string | null
  metadata: Prisma.JsonValue | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}> {
  return prisma.$transaction(async (tx) => {
    if (params.isActive) {
      await tx.character.updateMany({
        where: {
          campaignId: params.campaignId,
          userId: params.userId,
        },
        data: { isActive: false },
      })
    }

    const created = await tx.character.create({
      data: {
        campaignId: params.campaignId,
        userId: params.userId,
        name: params.name,
        status: params.status || 'ALIVE',
        race: params.race,
        class: params.class,
        subclass: params.subclass,
        avatarUrl: params.avatarUrl,
        metadata: (params.metadata as Prisma.InputJsonValue) || undefined,
        isActive: params.isActive || false,
      },
    })

    return {
      id: created.id,
      campaignId: created.campaignId,
      userId: created.userId,
      name: created.name,
      status: created.status,
      race: created.race,
      class: created.class,
      subclass: created.subclass,
      avatarUrl: created.avatarUrl,
      metadata: created.metadata,
      isActive: created.isActive,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    }
  })
}

export async function listCharactersForUser(userId: string): Promise<
  Array<{
    id: string
    campaignId: string
    userId: string
    name: string
    status: 'ALIVE' | 'DEAD' | 'LEFT' | 'UNKNOWN'
    race: string | null
    class: string | null
    subclass: string | null
    avatarUrl: string | null
    metadata: Prisma.JsonValue | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }>
> {
  const rows = await prisma.character.findMany({
    where: { userId },
    orderBy: [{ campaignId: 'asc' }, { createdAt: 'asc' }],
  })

  return rows.map((row: any) => ({
    id: row.id,
    campaignId: row.campaignId,
    userId: row.userId,
    name: row.name,
    status: row.status,
    race: row.race,
    class: row.class,
    subclass: row.subclass,
    avatarUrl: row.avatarUrl,
    metadata: row.metadata,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function isUserInCampaign(params: {
  userId: string
  campaignId: string
}): Promise<boolean> {
  const membership = await prisma.campaignMembership.findUnique({
    where: {
      campaignId_userId: {
        campaignId: params.campaignId,
        userId: params.userId,
      },
    },
  })

  return !!membership
}
