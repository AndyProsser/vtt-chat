import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export async function createRoomRecord(params: {
  id: string
  sessionId: string
  name: string
  type: 'MAIN' | 'GROUP' | 'PRIVATE'
  createdBy: string
  createdAt: Date
}): Promise<void> {
  await prisma.room.create({
    data: {
      id: params.id,
      sessionId: params.sessionId,
      name: params.name,
      type: params.type,
      createdBy: params.createdBy,
      createdAt: params.createdAt,
    },
  })
}

export async function findRoomById(roomId: string): Promise<{
  id: string
  sessionId: string
  name: string
  type: 'MAIN' | 'GROUP' | 'PRIVATE'
  createdBy: string
  createdAt: Date
  updatedAt: Date
} | null> {
  const row = await prisma.room.findUnique({
    where: { id: roomId },
  })

  if (!row) return null

  return {
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    type: row.type,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listRoomsBySession(sessionId: string): Promise<
  Array<{
    id: string
    sessionId: string
    name: string
    type: 'MAIN' | 'GROUP' | 'PRIVATE'
    createdBy: string
    createdAt: Date
    updatedAt: Date
  }>
> {
  const rows = await prisma.room.findMany({
    where: { sessionId },
    orderBy: [{ createdAt: 'asc' }],
  })

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    type: row.type,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function deleteRoomRecord(roomId: string): Promise<void> {
  await prisma.room.delete({
    where: { id: roomId },
  })
}

export async function upsertPresenceSnapshotRecord(params: {
  sessionId: string
  campaignId?: string
  userId: string
  username: string
  primaryRoomId?: string
  privateRoomId?: string
  state: 'ONLINE' | 'TYPING' | 'SPEAKING' | 'IDLE' | 'OFFLINE'
  lastSeenAt: Date
}): Promise<void> {
  await prisma.presenceSnapshot.upsert({
    where: {
      sessionId_userId: {
        sessionId: params.sessionId,
        userId: params.userId,
      },
    },
    create: {
      sessionId: params.sessionId,
      campaignId: params.campaignId,
      userId: params.userId,
      username: params.username,
      primaryRoomId: params.primaryRoomId,
      privateRoomId: params.privateRoomId,
      state: params.state,
      lastSeenAt: params.lastSeenAt,
    },
    update: {
      campaignId: params.campaignId,
      username: params.username,
      primaryRoomId: params.primaryRoomId,
      privateRoomId: params.privateRoomId,
      state: params.state,
      lastSeenAt: params.lastSeenAt,
    },
  })
}

export async function listPresenceSnapshotsBySession(sessionId: string): Promise<
  Array<{
    sessionId: string
    campaignId: string | null
    userId: string
    username: string
    primaryRoomId: string | null
    privateRoomId: string | null
    state: 'ONLINE' | 'TYPING' | 'SPEAKING' | 'IDLE' | 'OFFLINE'
    lastSeenAt: Date
    createdAt: Date
    updatedAt: Date
  }>
> {
  const rows = await prisma.presenceSnapshot.findMany({
    where: { sessionId },
    orderBy: [{ lastSeenAt: 'desc' }],
  })

  return rows.map((row) => ({
    sessionId: row.sessionId,
    campaignId: row.campaignId,
    userId: row.userId,
    username: row.username,
    primaryRoomId: row.primaryRoomId,
    privateRoomId: row.privateRoomId,
    state: row.state,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function deletePresenceSnapshotRecord(params: {
  sessionId: string
  userId: string
}): Promise<void> {
  await prisma.presenceSnapshot.deleteMany({
    where: {
      sessionId: params.sessionId,
      userId: params.userId,
    },
  })
}
