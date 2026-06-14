import { Prisma } from '@prisma/client'
import { deriveCampaignDisplayState, type CampaignDisplayState, type SessionState } from '@shared'
import { getPrismaClient } from '@/infra/db'
import { DEV_MOCK_PREFIX } from '@/constants/dev-mock.constants'
import { logger } from '@/utils/logger'

const prisma = getPrismaClient()
const PRESENCE_FLAP_GRACE_MS = 8_000

function isRealtimeSessionState(state: SessionState | null): boolean {
  return state === 'ACTIVE' || state === 'PAUSED' || state === 'COOLDOWN'
}

function isLikelyConnectedPresence(params: {
  state: 'ONLINE' | 'TYPING' | 'SPEAKING' | 'IDLE' | 'OFFLINE'
  lastSeenAt: Date
  nowMs: number
}): boolean {
  if (params.state !== 'OFFLINE') {
    return true
  }

  const lastSeenAtMs = params.lastSeenAt.getTime()
  return Number.isFinite(lastSeenAtMs) && params.nowMs - lastSeenAtMs <= PRESENCE_FLAP_GRACE_MS
}

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

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function isCampaignSchemaDriftError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return [
    'retiredat',
    'campaignjoinrequest',
    'joinrequests',
    'column',
    'table',
    'does not exist',
  ].some((token) => message.includes(token))
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
    extensionSyncPolicy: 'NONE' | 'DM_ONLY' | 'DM_AND_PLAYERS'
    currentDmId: string
    memberRole: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
    latestSessionState: SessionState | null
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
    discoverable: boolean
    retiredAt: Date | null
    pendingJoinRequests: number
    sessionScheduleType: string | null
    sessionScheduleDay: number | null
    sessionScheduleNth: number | null
    sessionScheduleHour: number | null
    sessionScheduleMinute: number | null
    sessionScheduleTz: string | null
    nextSessionDate: Date | null
    nextSessionIsManual: boolean
  }>
> {
  let memberships: any[]

  try {
    memberships = await prisma.campaignMembership.findMany({
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
                user: {
                  select: {
                    username: true,
                  },
                },
              },
            },
            sessions: {
              select: {
                state: true,
                presence: {
                  select: {
                    userId: true,
                    state: true,
                    lastSeenAt: true,
                  },
                },
              },
              orderBy: [{ createdAt: 'desc' }],
              take: 1,
            },
            joinRequests: {
              where: { status: 'PENDING' },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    })
  } catch (error) {
    if (!isCampaignSchemaDriftError(error)) {
      throw error
    }

    logger.warn('campaign.repository', 'Campaign list falling back to legacy schema query', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })

    memberships = await prisma.campaignMembership.findMany({
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
                user: {
                  select: {
                    username: true,
                  },
                },
              },
            },
            sessions: {
              select: {
                state: true,
                presence: {
                  select: {
                    userId: true,
                    state: true,
                    lastSeenAt: true,
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
  }

  return memberships
    .filter((membership: any) => membership.campaign?.deletedAt == null)
    .map((m: any) => ({
      ...(() => {
        const latestSessionState = (m.campaign.sessions?.[0]?.state || null) as SessionState | null
        const nowMs = Date.now()

        const latestSessionPresence = (m.campaign.sessions?.[0]?.presence || []) as Array<{
          userId: string
          state: 'ONLINE' | 'TYPING' | 'SPEAKING' | 'IDLE' | 'OFFLINE'
          lastSeenAt: Date
        }>
        const nonMockMemberUserIds = new Set<string>(
          (m.campaign.members || [])
            .filter(
              (member: { user?: { username?: string | null } | null }) =>
                !member.user?.username?.startsWith(DEV_MOCK_PREFIX)
            )
            .map((member: { userId: string }) => member.userId)
        )

        const onlineUserIds = new Set<string>(
          latestSessionPresence
            .filter((entry) => isLikelyConnectedPresence({ ...entry, nowMs }))
            .map((entry) => entry.userId)
            .filter((userId) => nonMockMemberUserIds.has(userId))
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

        const hasRealtimeSession = isRealtimeSessionState(latestSessionState)

        const connectedPlayersRounded = roundPresenceCountForPrivacy(connectedPlayers)
        const connectedSpectatorsRounded = roundPresenceCountForPrivacy(connectedSpectators)

        return {
          latestSessionState,
          displayState: deriveCampaignDisplayState(latestSessionState),
          dmOnline: hasRealtimeSession && onlineUserIds.has(m.campaign.currentDmId),
          connectedPlayers: hasRealtimeSession ? connectedPlayers : 0,
          connectedPlayersRounded: hasRealtimeSession ? connectedPlayersRounded : 0,
          connectedPlayersLabel: hasRealtimeSession
            ? toPresenceCountLabel(connectedPlayers, connectedPlayersRounded)
            : '0',
          connectedSpectators: hasRealtimeSession ? connectedSpectators : 0,
          connectedSpectatorsRounded: hasRealtimeSession ? connectedSpectatorsRounded : 0,
          connectedSpectatorsLabel: toPresenceCountLabel(
            hasRealtimeSession ? connectedSpectators : 0,
            hasRealtimeSession ? connectedSpectatorsRounded : 0
          ),
        }
      })(),
      id: m.campaign.id,
      name: m.campaign.name,
      description: m.campaign.description,
      posterUrl: m.campaign.posterUrl,
      inviteCode: m.campaign.inviteCode,
      extensionSyncPolicy: m.campaign.extensionSyncPolicy,
      currentDmId: m.campaign.currentDmId,
      dmUsername: m.campaign.currentDm?.username || 'dm',
      dmDisplayName: m.campaign.currentDm?.displayName || m.campaign.currentDm?.username || 'DM',
      dmAvatarUrl: m.campaign.currentDm?.avatarUrl || null,
      memberRole: m.role,
      createdAt: m.campaign.createdAt,
      updatedAt: m.campaign.updatedAt,
      discoverable: m.campaign.discoverable ?? false,
      retiredAt: m.campaign.retiredAt ?? null,
      pendingJoinRequests: (m.campaign.joinRequests || []).length,
      sessionScheduleType: (m.campaign as any).sessionScheduleType ?? null,
      sessionScheduleDay: (m.campaign as any).sessionScheduleDay ?? null,
      sessionScheduleNth: (m.campaign as any).sessionScheduleNth ?? null,
      sessionScheduleHour: (m.campaign as any).sessionScheduleHour ?? null,
      sessionScheduleMinute: (m.campaign as any).sessionScheduleMinute ?? null,
      sessionScheduleTz: (m.campaign as any).sessionScheduleTz ?? null,
      nextSessionDate: (m.campaign as any).nextSessionDate ?? null,
      nextSessionIsManual: (m.campaign as any).nextSessionIsManual ?? false,
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
  memberRole: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  postSessionChatEnabled: boolean
  postSessionChatDurationMs: number
  latestSessionState: SessionState | null
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
    memberRole: membership.role,
    postSessionChatEnabled: membership.campaign.postSessionChatEnabled,
    postSessionChatDurationMs: membership.campaign.postSessionChatDurationMs,
    latestSessionState: (membership.campaign.sessions[0]?.state || null) as SessionState | null,
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

export async function updateCharacterForCampaignMember(params: {
  campaignId: string
  userId: string
  characterId: string
  name?: string
  race?: string | null
  class?: string | null
  subclass?: string | null
  avatarUrl?: string | null
  metadata?: Record<string, unknown> | null
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
} | null> {
  const existing = await prisma.character.findFirst({
    where: {
      id: params.characterId,
      campaignId: params.campaignId,
      userId: params.userId,
    },
  })

  if (!existing) {
    return null
  }

  return prisma.$transaction(async (tx) => {
    if (params.isActive) {
      await tx.character.updateMany({
        where: {
          campaignId: params.campaignId,
          userId: params.userId,
          id: { not: params.characterId },
        },
        data: { isActive: false },
      })
    }

    const updated = await tx.character.update({
      where: { id: params.characterId },
      data: {
        ...(params.name !== undefined ? { name: params.name } : {}),
        ...(params.race !== undefined ? { race: params.race } : {}),
        ...(params.class !== undefined ? { class: params.class } : {}),
        ...(params.subclass !== undefined ? { subclass: params.subclass } : {}),
        ...(params.avatarUrl !== undefined ? { avatarUrl: params.avatarUrl } : {}),
        ...(params.metadata !== undefined
          ? {
              metadata:
                params.metadata === null
                  ? Prisma.JsonNull
                  : (params.metadata as Prisma.InputJsonValue),
            }
          : {}),
        ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      },
    })

    return {
      id: updated.id,
      campaignId: updated.campaignId,
      userId: updated.userId,
      name: updated.name,
      status: updated.status,
      race: updated.race,
      class: updated.class,
      subclass: updated.subclass,
      avatarUrl: updated.avatarUrl,
      metadata: updated.metadata,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }
  })
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

export async function listCampaignMemberIds(campaignId: string): Promise<string[]> {
  const memberships = await prisma.campaignMembership.findMany({
    where: { campaignId },
    select: { userId: true },
  })
  return memberships.map((m) => m.userId)
}

export interface CampaignMemberPresenceProfile {
  userId: string
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  playerName: string
  avatarUrl: string | null
  characterName: string | null
  characterClass: string | null
  characterRace: string | null
  level: number | null
  characterStats: Prisma.JsonValue | null
}

/**
 * Returns campaign members with the most useful profile fields for PARTY presence rendering.
 * Character fields prefer the active character when present.
 */
export async function listCampaignMembersForPresence(
  campaignId: string
): Promise<CampaignMemberPresenceProfile[]> {
  const memberships = await prisma.campaignMembership.findMany({
    where: { campaignId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      campaign: {
        select: {
          currentDmId: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { user: { username: 'asc' } }],
  })

  const userIds = memberships.map((membership) => membership.userId)
  const activeCharacters =
    userIds.length > 0
      ? await prisma.character.findMany({
          where: {
            campaignId,
            userId: { in: userIds },
            isActive: true,
          },
          select: {
            userId: true,
            name: true,
            class: true,
            race: true,
            metadata: true,
            avatarUrl: true,
          },
        })
      : []

  const characterByUser = new Map(
    activeCharacters.map((character) => [character.userId, character] as const)
  )

  return memberships.map((membership) => {
    const activeCharacter = characterByUser.get(membership.userId)
    const metadata = (activeCharacter?.metadata as Record<string, unknown> | null) || null
    const rawLevel = metadata && typeof metadata.level === 'number' ? metadata.level : null
    const effectiveRole =
      membership.userId === membership.campaign.currentDmId ? 'DM' : membership.role

    return {
      userId: membership.userId,
      username: membership.user.username,
      role: effectiveRole,
      playerName: membership.user.displayName || membership.user.username,
      avatarUrl: activeCharacter?.avatarUrl || membership.user.avatarUrl || null,
      characterName: activeCharacter?.name || null,
      characterClass: activeCharacter?.class || null,
      characterRace: activeCharacter?.race || null,
      level: rawLevel !== null ? Math.max(1, Math.min(20, Math.round(rawLevel))) : null,
      characterStats: (metadata as Prisma.JsonValue | null) ?? null,
    }
  })
}

export async function getCampaignDmId(campaignId: string): Promise<string | null> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { currentDmId: true },
  })
  return campaign?.currentDmId ?? null
}

/**
 * Returns lobby-visible campaigns that the requesting user is NOT a member of.
 * Includes both PUBLIC and PRIVATE non-retired campaigns so private cards can render
 * in a dimmed locked state when no watch path is currently available.
 */
export async function listDiscoverableCampaigns(userId: string): Promise<
  Array<{
    id: string
    name: string
    description: string | null
    posterUrl: string | null
    discoverable: boolean
    spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
    spectatorInviteCode: string | null
    spectatorInviteActive: boolean
    activeSessionState: SessionState | null
    spectatorsEnabled: boolean
    activeConnectedCount: number
    dmUsername: string
    dmDisplayName: string
    dmAvatarUrl: string | null
    createdAt: Date
  }>
> {
  // Exclude campaigns where user is already a member
  const memberCampaignIds = await prisma.campaignMembership
    .findMany({ where: { userId }, select: { campaignId: true } })
    .then((rows) => rows.map((r) => r.campaignId))

  let campaigns: any[]

  try {
    campaigns = await prisma.campaign.findMany({
      where: {
        retiredAt: null,
        deletedAt: null,
        ...(memberCampaignIds.length > 0 ? { id: { notIn: memberCampaignIds } } : {}),
      },
      include: {
        currentDm: {
          select: { username: true, displayName: true, avatarUrl: true },
        },
        members: {
          select: { userId: true, role: true },
        },
        sessions: {
          where: { state: 'ACTIVE' },
          select: {
            state: true,
            presence: {
              select: { userId: true, state: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })
  } catch (error) {
    if (!isCampaignSchemaDriftError(error)) {
      throw error
    }

    logger.warn('campaign.repository', 'Campaign discover query falling back to legacy schema', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })

    return []
  }

  return campaigns
    .map((c: any) => {
      const activeSession = c.sessions?.[0] || null
      const activeSessionState = (activeSession?.state || null) as SessionState | null
      const onlineUserIds = new Set<string>(
        (activeSession?.presence || [])
          .filter((p: { state: string }) => p.state === 'ONLINE')
          .map((p: { userId: string }) => p.userId)
      )
      const roleByUserId = new Map<string, string>(
        (c.members || []).map((m: { userId: string; role: string }) => [m.userId, m.role])
      )

      const dmOnline = onlineUserIds.has(c.currentDmId)
      const playersOnline = Array.from(onlineUserIds).filter(
        (id) => roleByUserId.get(id) === 'PLAYER'
      ).length
      const activeConnectedCount = (dmOnline ? 1 : 0) + playersOnline
      const spectatorsEnabled = c.spectatorPolicy !== 'NONE'

      return {
        id: c.id,
        name: c.name,
        description: c.description,
        posterUrl: c.posterUrl,
        discoverable: c.discoverable,
        spectatorPolicy: c.spectatorPolicy as 'NONE' | 'GUESTS' | 'USERS',
        spectatorInviteCode: c.spectatorInviteCode ?? null,
        spectatorInviteActive: Boolean(c.spectatorInviteActive),
        activeSessionState,
        spectatorsEnabled,
        activeConnectedCount,
        dmUsername: c.currentDm?.username || 'dm',
        dmDisplayName: c.currentDm?.displayName || c.currentDm?.username || 'DM',
        dmAvatarUrl: c.currentDm?.avatarUrl || null,
        createdAt: c.createdAt,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
}

/**
 * Submit a join request for a PUBLIC campaign. One pending request per user per campaign.
 */
export async function createJoinRequest(params: {
  campaignId: string
  userId: string
  message?: string
}): Promise<
  | {
      id: string
      campaignId: string
      userId: string
      message: string | null
      status: 'PENDING'
      requestedAt: Date
    }
  | { error: 'ALREADY_MEMBER' | 'NOT_DISCOVERABLE' | 'ALREADY_PENDING' | 'RETIRED' }
> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { discoverable: true, retiredAt: true },
  })

  if (!campaign) return { error: 'NOT_DISCOVERABLE' }
  if (campaign.retiredAt !== null) return { error: 'RETIRED' }
  if (!campaign.discoverable) return { error: 'NOT_DISCOVERABLE' }

  const existingMembership = await prisma.campaignMembership.findUnique({
    where: { campaignId_userId: { campaignId: params.campaignId, userId: params.userId } },
  })
  if (existingMembership) return { error: 'ALREADY_MEMBER' }

  const existingRequest = await prisma.campaignJoinRequest.findUnique({
    where: { campaignId_userId: { campaignId: params.campaignId, userId: params.userId } },
  })
  if (existingRequest?.status === 'PENDING') return { error: 'ALREADY_PENDING' }

  // Upsert: re-open a previously resolved request
  const request = await prisma.campaignJoinRequest.upsert({
    where: { campaignId_userId: { campaignId: params.campaignId, userId: params.userId } },
    create: {
      campaignId: params.campaignId,
      userId: params.userId,
      message: params.message ?? null,
      status: 'PENDING',
    },
    update: {
      message: params.message ?? null,
      status: 'PENDING',
      resolvedAt: null,
      requestedAt: new Date(),
    },
  })

  return {
    id: request.id,
    campaignId: request.campaignId,
    userId: request.userId,
    message: request.message,
    status: 'PENDING',
    requestedAt: request.requestedAt,
  }
}

/**
 * List pending join requests for a campaign so the DM can review them from the lobby.
 */
export async function listPendingJoinRequests(campaignId: string): Promise<
  Array<{
    id: string
    userId: string
    username: string
    displayName: string
    avatarUrl: string | null
    message: string | null
    requestedAt: Date
  }>
> {
  const requests = await prisma.campaignJoinRequest.findMany({
    where: { campaignId, status: 'PENDING' },
    orderBy: [{ requestedAt: 'asc' }],
    select: {
      id: true,
      userId: true,
      message: true,
      requestedAt: true,
      user: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  })

  return requests.map((request) => ({
    id: request.id,
    userId: request.userId,
    username: request.user?.username || 'user',
    displayName: request.user?.displayName || request.user?.username || 'Player',
    avatarUrl: request.user?.avatarUrl || null,
    message: request.message,
    requestedAt: request.requestedAt,
  }))
}

/**
 * Resolve (approve or reject) a pending join request.
 * On approve: creates a PLAYER membership and resolves the request.
 */
export async function resolveJoinRequest(params: {
  requestId: string
  campaignId: string
  resolution: 'APPROVED' | 'REJECTED'
}): Promise<
  | {
      requestId: string
      userId: string
      resolution: 'APPROVED' | 'REJECTED'
    }
  | { error: 'NOT_FOUND' | 'NOT_PENDING' }
> {
  const request = await prisma.campaignJoinRequest.findFirst({
    where: { id: params.requestId, campaignId: params.campaignId },
  })

  if (!request) return { error: 'NOT_FOUND' }
  if (request.status !== 'PENDING') return { error: 'NOT_PENDING' }

  await prisma.$transaction(async (tx) => {
    await tx.campaignJoinRequest.update({
      where: { id: params.requestId },
      data: { status: params.resolution, resolvedAt: new Date() },
    })
    if (params.resolution === 'APPROVED') {
      await tx.campaignMembership.upsert({
        where: {
          campaignId_userId: { campaignId: params.campaignId, userId: request.userId },
        },
        create: {
          campaignId: params.campaignId,
          userId: request.userId,
          role: 'PLAYER',
        },
        update: { role: 'PLAYER' },
      })
    }
  })

  return { requestId: params.requestId, userId: request.userId, resolution: params.resolution }
}

/**
 * Delete a campaign. In development (hard=true) the row is permanently removed.
 * In production (hard=false) a soft-delete tombstone is set via `deletedAt`.
 * Only allowed when no active or paused session exists.
 */
export async function deleteCampaign(
  campaignId: string,
  options: { hard: boolean }
): Promise<{ success: true } | { error: 'NOT_FOUND' | 'ACTIVE_SESSION' | 'ALREADY_DELETED' }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      sessions: {
        where: { state: { in: ['ACTIVE', 'PAUSED'] } },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!campaign) return { error: 'NOT_FOUND' }
  if (campaign.sessions.length > 0) return { error: 'ACTIVE_SESSION' }

  if (options.hard) {
    await prisma.campaign.delete({ where: { id: campaignId } })
    return { success: true }
  }

  if (campaign.deletedAt !== null) return { error: 'ALREADY_DELETED' }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { deletedAt: new Date() },
  })

  return { success: true }
}

/**
 * Retire a campaign (soft-delete). Only allowed when no active session exists.
 */
export async function retireCampaign(
  campaignId: string
): Promise<
  { success: true; retiredAt: Date } | { error: 'NOT_FOUND' | 'ACTIVE_SESSION' | 'ALREADY_RETIRED' }
> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      sessions: {
        where: { state: { in: ['ACTIVE', 'PAUSED'] } },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!campaign) return { error: 'NOT_FOUND' }
  if (campaign.retiredAt !== null) return { error: 'ALREADY_RETIRED' }
  if (campaign.sessions.length > 0) return { error: 'ACTIVE_SESSION' }

  const retiredAt = new Date()
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { retiredAt },
  })

  return { success: true, retiredAt }
}

/**
 * Resume a retired campaign by clearing its retiredAt timestamp.
 */
export async function resumeCampaign(
  campaignId: string
): Promise<{ success: true } | { error: 'NOT_FOUND' | 'NOT_RETIRED' }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { retiredAt: true },
  })

  if (!campaign) return { error: 'NOT_FOUND' }
  if (campaign.retiredAt === null) return { error: 'NOT_RETIRED' }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { retiredAt: null },
  })

  return { success: true }
}
