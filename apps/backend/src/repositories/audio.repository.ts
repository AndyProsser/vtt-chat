import { getPrismaClient } from '@/infra/db'
import { Prisma } from '@prisma/client'

const prisma = getPrismaClient()

function toInputJsonValue(value: Record<string, unknown> | undefined): Prisma.InputJsonValue {
  return (value || {}) as Prisma.InputJsonValue
}

export async function upsertAudioRoomStateRecord(params: {
  sessionId: string
  roomId: string
  environmentName: string
  environmentId: string
  parameters?: Record<string, unknown>
  setBy: string
  setAt: Date
}): Promise<void> {
  await prisma.audioRoomState.upsert({
    where: {
      sessionId_roomId: {
        sessionId: params.sessionId,
        roomId: params.roomId,
      },
    },
    create: {
      sessionId: params.sessionId,
      roomId: params.roomId,
      environmentName: params.environmentName,
      environmentId: params.environmentId,
      parameters: toInputJsonValue(params.parameters),
      setBy: params.setBy,
      setAt: params.setAt,
    },
    update: {
      environmentName: params.environmentName,
      environmentId: params.environmentId,
      parameters: toInputJsonValue(params.parameters),
      setBy: params.setBy,
      setAt: params.setAt,
    },
  })
}

export async function listAudioRoomStateBySession(sessionId: string): Promise<
  Array<{
    sessionId: string
    roomId: string
    environmentName: string
    environmentId: string
    parameters: unknown
    setBy: string
    setAt: Date
  }>
> {
  const rows = await prisma.audioRoomState.findMany({
    where: { sessionId },
    orderBy: [{ setAt: 'desc' }],
  })

  return rows.map((row) => ({
    sessionId: row.sessionId,
    roomId: row.roomId,
    environmentName: row.environmentName,
    environmentId: row.environmentId,
    parameters: row.parameters,
    setBy: row.setBy,
    setAt: row.setAt,
  }))
}

export async function upsertAudioDMOverrideRecord(params: {
  sessionId: string
  targetUserId: string
  overrideType: string
  parameters?: Record<string, unknown>
  appliedBy: string
  appliedAt: Date
}): Promise<void> {
  await prisma.audioDMOverride.upsert({
    where: {
      sessionId_targetUserId_overrideType: {
        sessionId: params.sessionId,
        targetUserId: params.targetUserId,
        overrideType: params.overrideType,
      },
    },
    create: {
      sessionId: params.sessionId,
      targetUserId: params.targetUserId,
      overrideType: params.overrideType,
      parameters: toInputJsonValue(params.parameters),
      appliedBy: params.appliedBy,
      appliedAt: params.appliedAt,
    },
    update: {
      parameters: toInputJsonValue(params.parameters),
      appliedBy: params.appliedBy,
      appliedAt: params.appliedAt,
    },
  })
}

export async function removeAudioDMOverrideRecord(params: {
  sessionId: string
  targetUserId: string
  overrideType: string
}): Promise<number> {
  const result = await prisma.audioDMOverride.deleteMany({
    where: {
      sessionId: params.sessionId,
      targetUserId: params.targetUserId,
      overrideType: params.overrideType,
    },
  })
  return result.count
}

export async function removeAudioDMOverridesBySession(sessionId: string): Promise<void> {
  await prisma.audioDMOverride.deleteMany({
    where: {
      sessionId,
    },
  })
}

export async function removeAudioRoomStateRecord(params: {
  sessionId: string
  roomId: string
}): Promise<void> {
  await prisma.audioRoomState.deleteMany({
    where: {
      sessionId: params.sessionId,
      roomId: params.roomId,
    },
  })
}

export async function listAudioDMOverridesBySession(sessionId: string): Promise<
  Array<{
    sessionId: string
    targetUserId: string
    overrideType: string
    parameters: unknown
    appliedBy: string
    appliedAt: Date
  }>
> {
  const rows = await prisma.audioDMOverride.findMany({
    where: { sessionId },
    orderBy: [{ appliedAt: 'desc' }],
  })

  return rows.map((row) => ({
    sessionId: row.sessionId,
    targetUserId: row.targetUserId,
    overrideType: row.overrideType,
    parameters: row.parameters,
    appliedBy: row.appliedBy,
    appliedAt: row.appliedAt,
  }))
}
