import { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export interface SessionParticipantProfile {
  userId: string
  username: string
  playerName: string
  avatarUrl: string | null
  characterName: string | null
  characterClass: string | null
  characterSubclass: string | null
  characterRace: string | null
  level: number | null
  characterStats: Record<string, unknown> | null
}

export async function createSessionRecord(params: {
  id: string
  campaignId?: string
  name: string
  description?: string
  plannedDurationMinutes?: number
  dmId: string
  state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
  createdAt: Date
}): Promise<void> {
  await prisma.session.create({
    data: {
      id: params.id,
      campaignId: params.campaignId,
      name: params.name,
      description: params.description,
      plannedDurationMinutes: params.plannedDurationMinutes,
      dmId: params.dmId,
      state: params.state,
      createdAt: params.createdAt,
    },
  })
}

export async function listSessionsByCampaign(campaignId: string): Promise<
  Array<{
    id: string
    campaignId: string | null
    name: string
    description: string | null
    plannedDurationMinutes: number | null
    cumulativePauseMs: number
    pauseCount: number
    pauseStartedAt: Date | null
    dmId: string
    state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
    createdAt: Date
    startedAt: Date | null
    endedAt: Date | null
  }>
> {
  const rows = await prisma.session.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row: any) => ({
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    description: row.description,
    plannedDurationMinutes: row.plannedDurationMinutes,
    cumulativePauseMs: row.cumulativePauseMs,
    pauseCount: row.pauseCount,
    pauseStartedAt: row.pauseStartedAt,
    dmId: row.dmId,
    state: row.state,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }))
}

export async function listSessions(): Promise<
  Array<{
    id: string
    name: string
    description: string | null
    plannedDurationMinutes: number | null
    cumulativePauseMs: number
    pauseCount: number
    pauseStartedAt: Date | null
    dmId: string
    state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
    createdAt: Date
    startedAt: Date | null
    endedAt: Date | null
  }>
> {
  const rows = await prisma.session.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    plannedDurationMinutes: row.plannedDurationMinutes,
    cumulativePauseMs: row.cumulativePauseMs,
    pauseCount: row.pauseCount,
    pauseStartedAt: row.pauseStartedAt,
    dmId: row.dmId,
    state: row.state,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }))
}

export async function listCleanupCandidateSessions(cutoff: Date): Promise<
  Array<{
    id: string
    dmId: string
    name: string
    state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
    updatedAt: Date
  }>
> {
  const rows = await prisma.session.findMany({
    where: {
      state: 'CLEANUP',
      updatedAt: {
        lte: cutoff,
      },
    },
    select: {
      id: true,
      dmId: true,
      name: true,
      state: true,
      updatedAt: true,
    },
  })

  return rows.map((row: any) => ({
    id: row.id,
    dmId: row.dmId,
    name: row.name,
    state: row.state,
    updatedAt: row.updatedAt,
  }))
}

export async function findSessionById(sessionId: string): Promise<{
  id: string
  campaignId: string | null
  name: string
  description: string | null
  plannedDurationMinutes: number | null
  cumulativePauseMs: number
  pauseCount: number
  pauseStartedAt: Date | null
  dmId: string
  state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
  createdAt: Date
  startedAt: Date | null
  endedAt: Date | null
} | null> {
  const row = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      campaignId: true,
      name: true,
      description: true,
      plannedDurationMinutes: true,
      cumulativePauseMs: true,
      pauseCount: true,
      pauseStartedAt: true,
      dmId: true,
      state: true,
      createdAt: true,
      startedAt: true,
      endedAt: true,
    },
  })

  if (!row) return null

  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    description: row.description,
    plannedDurationMinutes: row.plannedDurationMinutes,
    cumulativePauseMs: row.cumulativePauseMs,
    pauseCount: row.pauseCount,
    pauseStartedAt: row.pauseStartedAt,
    dmId: row.dmId,
    state: row.state,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }
}

export async function updateSessionStateRecord(params: {
  sessionId: string
  newState: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
  startedAt?: Date
  endedAt?: Date
  cumulativePauseMs?: number
  pauseCount?: number
  pauseStartedAt?: Date | null | undefined
}): Promise<void> {
  const data: {
    state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED' | 'CLEANUP'
    startedAt?: Date
    endedAt?: Date
    cumulativePauseMs?: number
    pauseCount?: number
    pauseStartedAt?: Date | null
  } = {
    state: params.newState,
  }

  if (params.startedAt) {
    data.startedAt = params.startedAt
  }
  if (params.endedAt) {
    data.endedAt = params.endedAt
  }
  if (params.cumulativePauseMs !== undefined) {
    data.cumulativePauseMs = params.cumulativePauseMs
  }
  if (params.pauseCount !== undefined) {
    data.pauseCount = params.pauseCount
  }
  if (params.pauseStartedAt !== undefined) {
    data.pauseStartedAt = params.pauseStartedAt ?? null
  }

  await prisma.session.update({
    where: { id: params.sessionId },
    data,
  })
}

export async function updateSessionMetadataRecord(params: {
  sessionId: string
  name?: string
  description?: string | null
  plannedDurationMinutes?: number | null
}): Promise<void> {
  await prisma.session.update({
    where: { id: params.sessionId },
    data: {
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.plannedDurationMinutes !== undefined
        ? { plannedDurationMinutes: params.plannedDurationMinutes }
        : {}),
    },
  })
}

export async function updateSessionEndedAtRecord(params: {
  sessionId: string
  endedAt: Date
}): Promise<void> {
  await prisma.session.update({
    where: { id: params.sessionId },
    data: {
      endedAt: params.endedAt,
    },
  })
}

export async function deleteSessionRecord(sessionId: string): Promise<void> {
  await prisma.session.delete({
    where: { id: sessionId },
  })
}

export async function upsertSessionMember(params: {
  sessionId: string
  userId: string
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
}): Promise<void> {
  await prisma.sessionMember.upsert({
    where: {
      sessionId_userId: {
        sessionId: params.sessionId,
        userId: params.userId,
      },
    },
    create: {
      sessionId: params.sessionId,
      userId: params.userId,
      username: params.username,
      role: params.role,
    },
    update: {
      username: params.username,
      role: params.role,
    },
  })
}

export async function removeSessionMember(params: {
  sessionId: string
  userId: string
}): Promise<boolean> {
  const result = await prisma.sessionMember.deleteMany({
    where: {
      sessionId: params.sessionId,
      userId: params.userId,
    },
  })
  return result.count > 0
}

export async function listSessionMembers(sessionId: string): Promise<
  Array<{
    userId: string
    username: string
    role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
    joinedAt: Date
  }>
> {
  const rows = await prisma.sessionMember.findMany({
    where: { sessionId },
  })

  return rows.map((row: any) => ({
    userId: row.userId,
    username: row.username,
    role: row.role,
    joinedAt: row.joinedAt,
  }))
}

function toRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

export async function getSessionParticipantProfiles(
  sessionId: string
): Promise<Record<string, SessionParticipantProfile>> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      campaignId: true,
      members: {
        select: {
          userId: true,
          username: true,
        },
      },
    },
  })

  if (!session || session.members.length === 0) {
    return {}
  }

  const userIds = session.members.map((member) => member.userId)
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  })
  const usersById = new Map(users.map((user) => [user.id, user]))

  const characters = session.campaignId
    ? await prisma.character.findMany({
        where: {
          campaignId: session.campaignId,
          userId: { in: userIds },
        },
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        select: {
          userId: true,
          name: true,
          race: true,
          class: true,
          subclass: true,
          avatarUrl: true,
          metadata: true,
        },
      })
    : []

  const characterByUserId = new Map<string, (typeof characters)[number]>()
  for (const character of characters) {
    if (!characterByUserId.has(character.userId)) {
      characterByUserId.set(character.userId, character)
    }
  }

  return session.members.reduce(
    (acc, member) => {
      const user = usersById.get(member.userId)
      const character = characterByUserId.get(member.userId)
      const metadata = toRecord(character?.metadata ?? null)
      const levelValue = metadata?.level

      acc[member.userId] = {
        userId: member.userId,
        username: member.username,
        playerName: user?.displayName || user?.username || member.username,
        avatarUrl: character?.avatarUrl || user?.avatarUrl || null,
        characterName: character?.name || null,
        characterClass: character?.class || null,
        characterSubclass: character?.subclass || null,
        characterRace: character?.race || null,
        level: typeof levelValue === 'number' ? levelValue : null,
        characterStats: metadata,
      }

      return acc
    },
    {} as Record<string, SessionParticipantProfile>
  )
}
