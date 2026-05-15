import type { PrismaClient } from '@prisma/client'
import { toDate } from './shared'

interface RecordingCreateInput {
  campaignId: string
  sessionId?: string | null
  roomId?: string | null
  title: string
  storageKey?: string | null
  sourceUrl?: string | null
  durationSeconds?: number | null
  startedAt?: string | null
  endedAt?: string | null
  journalSummary?: string | null
  metadata?: import('@prisma/client').Prisma.InputJsonValue | null
}

export async function listRecordingMetadata(prisma: PrismaClient, campaignId: string) {
  return prisma.recordingMetadata.findMany({
    where: { campaignId },
    orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      campaignId: true,
      sessionId: true,
      roomId: true,
      title: true,
      storageKey: true,
      sourceUrl: true,
      durationSeconds: true,
      startedAt: true,
      endedAt: true,
      journalSummary: true,
      metadata: true,
      session: {
        select: {
          id: true,
          name: true,
        },
      },
      room: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function createRecordingMetadata(prisma: PrismaClient, input: RecordingCreateInput) {
  return prisma.recordingMetadata.create({
    data: {
      campaignId: input.campaignId,
      sessionId: input.sessionId || null,
      roomId: input.roomId || null,
      title: input.title,
      storageKey: input.storageKey || null,
      sourceUrl: input.sourceUrl || null,
      durationSeconds: input.durationSeconds || null,
      startedAt: toDate(input.startedAt),
      endedAt: toDate(input.endedAt),
      journalSummary: input.journalSummary || null,
      metadata: input.metadata || undefined,
    },
    select: {
      id: true,
      campaignId: true,
      sessionId: true,
      roomId: true,
      title: true,
      storageKey: true,
      sourceUrl: true,
      durationSeconds: true,
      startedAt: true,
      endedAt: true,
      journalSummary: true,
      metadata: true,
      session: {
        select: {
          id: true,
          name: true,
        },
      },
      room: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  })
}
