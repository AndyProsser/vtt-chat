import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export async function createSessionRecord(params: {
  id: string
  campaignId?: string
  name: string
  description?: string
  dmId: string
  state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED'
  createdAt: Date
}): Promise<void> {
  await prisma.session.create({
    data: {
      id: params.id,
      campaignId: params.campaignId,
      name: params.name,
      description: params.description,
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
    dmId: string
    state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED'
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
    dmId: string
    state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED'
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
    dmId: row.dmId,
    state: row.state,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }))
}

export async function findSessionById(sessionId: string): Promise<{
  id: string
  name: string
  description: string | null
  dmId: string
  state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED'
  createdAt: Date
  startedAt: Date | null
  endedAt: Date | null
} | null> {
  const row = await prisma.session.findUnique({
    where: { id: sessionId },
  })

  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dmId: row.dmId,
    state: row.state,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  }
}

export async function updateSessionStateRecord(params: {
  sessionId: string
  newState: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED'
  startedAt?: Date
  endedAt?: Date
}): Promise<void> {
  const data: {
    state: 'IDLE' | 'ACTIVE' | 'PAUSED' | 'ENDED'
    startedAt?: Date
    endedAt?: Date
  } = {
    state: params.newState,
  }

  if (params.startedAt) {
    data.startedAt = params.startedAt
  }
  if (params.endedAt) {
    data.endedAt = params.endedAt
  }

  await prisma.session.update({
    where: { id: params.sessionId },
    data,
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
