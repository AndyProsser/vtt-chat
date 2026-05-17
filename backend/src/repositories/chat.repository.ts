import { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export async function createChatMessageRecord(params: {
  id: string
  sessionId?: string | null
  campaignId?: string | null
  authorId: string
  authorUsername: string
  content: string
  type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
  isDmOnly: boolean
  isOffTheRecord?: boolean
  visibleTo?: unknown
  createdAt: Date
}): Promise<void> {
  await prisma.chatMessage.create({
    data: {
      id: params.id,
      sessionId: params.sessionId ?? undefined,
      campaignId: params.campaignId ?? undefined,
      authorId: params.authorId,
      authorUsername: params.authorUsername,
      content: params.content,
      type: params.type,
      isDmOnly: params.isDmOnly,
      isOffTheRecord: params.isOffTheRecord ?? false,
      visibleTo: params.visibleTo ? (params.visibleTo as Prisma.InputJsonValue) : undefined,
      createdAt: params.createdAt,
    },
  })
}

export async function listSessionMessages(sessionId: string): Promise<
  Array<{
    id: string
    sessionId: string
    authorId: string
    authorUsername: string
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    createdAt: Date
    editedAt: Date | null
    deletedAt: Date | null
    deletedBy: string | null
  }>
> {
  return listSessionMessagesSince(sessionId)
}

export async function listSessionMessagesSince(
  sessionId: string,
  since?: Date
): Promise<
  Array<{
    id: string
    sessionId: string
    authorId: string
    authorUsername: string
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    createdAt: Date
    editedAt: Date | null
    deletedAt: Date | null
    deletedBy: string | null
  }>
> {
  const rows = await prisma.chatMessage.findMany({
    where: {
      sessionId,
      ...(since
        ? {
            createdAt: {
              gte: since,
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
  })

  return rows.map((row: any) => ({
    id: row.id,
    sessionId: row.sessionId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    content: row.content,
    type: row.type,
    isDmOnly: row.isDmOnly,
    isOffTheRecord: row.isOffTheRecord,
    visibleTo: row.visibleTo,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  }))
}

export async function listSessionMessagesPage(params: {
  sessionId: string
  since?: Date
  before?: Date
  limit: number
}): Promise<{
  rows: Array<{
    id: string
    sessionId: string
    authorId: string
    authorUsername: string
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    createdAt: Date
    editedAt: Date | null
    deletedAt: Date | null
    deletedBy: string | null
  }>
  hasMore: boolean
}> {
  const queryLimit = Math.max(1, Math.min(100, params.limit))
  const createdAtFilter = {
    ...(params.since
      ? {
          gte: params.since,
        }
      : {}),
    ...(params.before
      ? {
          lt: params.before,
        }
      : {}),
  }

  const rows = await prisma.chatMessage.findMany({
    where: {
      sessionId: params.sessionId,
      ...(Object.keys(createdAtFilter).length > 0
        ? {
            createdAt: createdAtFilter,
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: queryLimit + 1,
  })

  const hasMore = rows.length > queryLimit
  const page = (hasMore ? rows.slice(0, queryLimit) : rows).reverse()

  return {
    rows: page.map((row: any) => ({
      id: row.id,
      sessionId: row.sessionId,
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      content: row.content,
      type: row.type,
      isDmOnly: row.isDmOnly,
      isOffTheRecord: row.isOffTheRecord,
      visibleTo: row.visibleTo,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    })),
    hasMore,
  }
}

export async function listMessagesBySessionIds(sessionIds: string[]): Promise<
  Array<{
    id: string
    sessionId: string
    authorId: string
    authorUsername: string
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    createdAt: Date
    editedAt: Date | null
    deletedAt: Date | null
    deletedBy: string | null
  }>
> {
  if (sessionIds.length === 0) {
    return []
  }

  const rows = await prisma.chatMessage.findMany({
    where: {
      sessionId: {
        in: sessionIds,
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return rows.map((row: any) => ({
    id: row.id,
    sessionId: row.sessionId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    content: row.content,
    type: row.type,
    isDmOnly: row.isDmOnly,
    isOffTheRecord: row.isOffTheRecord,
    visibleTo: row.visibleTo,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  }))
}

export async function listMessagesBySessionIdsPage(params: {
  sessionIds: string[]
  before?: Date
  limit: number
}): Promise<{
  rows: Array<{
    id: string
    sessionId: string
    authorId: string
    authorUsername: string
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    createdAt: Date
    editedAt: Date | null
    deletedAt: Date | null
    deletedBy: string | null
  }>
  hasMore: boolean
}> {
  if (params.sessionIds.length === 0) {
    return { rows: [], hasMore: false }
  }

  const queryLimit = Math.max(1, Math.min(100, params.limit))

  const rows = await prisma.chatMessage.findMany({
    where: {
      sessionId: {
        in: params.sessionIds,
      },
      ...(params.before
        ? {
            createdAt: {
              lt: params.before,
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: queryLimit + 1,
  })

  const hasMore = rows.length > queryLimit
  const page = (hasMore ? rows.slice(0, queryLimit) : rows).reverse()

  return {
    rows: page.map((row: any) => ({
      id: row.id,
      sessionId: row.sessionId,
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      content: row.content,
      type: row.type,
      isDmOnly: row.isDmOnly,
      isOffTheRecord: row.isOffTheRecord,
      visibleTo: row.visibleTo,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    })),
    hasMore,
  }
}

export async function findMessageById(messageId: string): Promise<{
  id: string
  sessionId: string | null
  campaignId: string | null
  authorId: string
  authorUsername: string
  content: string
  type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
  isDmOnly: boolean
  isOffTheRecord: boolean
  visibleTo: unknown
  createdAt: Date
  editedAt: Date | null
  deletedAt: Date | null
  deletedBy: string | null
} | null> {
  const row = await prisma.chatMessage.findUnique({
    where: { id: messageId },
  })

  if (!row) return null

  return {
    id: row.id,
    sessionId: row.sessionId,
    campaignId: row.campaignId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    content: row.content,
    type: row.type,
    isDmOnly: row.isDmOnly,
    isOffTheRecord: row.isOffTheRecord,
    visibleTo: row.visibleTo,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  }
}

export async function updateMessageRecord(params: {
  messageId: string
  content: string
  editedAt: Date
}): Promise<void> {
  await prisma.chatMessage.update({
    where: { id: params.messageId },
    data: {
      content: params.content,
      editedAt: params.editedAt,
    },
  })
}

export async function softDeleteMessageRecord(params: {
  messageId: string
  deletedBy: string
  deletedAt: Date
}): Promise<void> {
  await prisma.chatMessage.update({
    where: { id: params.messageId },
    data: {
      deletedBy: params.deletedBy,
      deletedAt: params.deletedAt,
    },
  })
}

export async function deleteMessageRecord(messageId: string): Promise<void> {
  await prisma.chatMessage.delete({
    where: { id: messageId },
  })
}

export async function deleteSessionMessages(sessionId: string): Promise<void> {
  await prisma.chatMessage.deleteMany({
    where: { sessionId },
  })
}

/**
 * List all greenroom messages for a campaign
 * @param campaignId Campaign UUID
 * @returns Array of campaign chat messages ordered by creation date
 */
export async function listCampaignMessages(campaignId: string): Promise<
  Array<{
    id: string
    campaignId: string
    authorId: string
    authorUsername: string
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    createdAt: Date
    editedAt: Date | null
    deletedAt: Date | null
    deletedBy: string | null
  }>
> {
  return listCampaignMessagesSince(campaignId)
}

export async function listCampaignMessagesSince(
  campaignId: string,
  since?: Date
): Promise<
  Array<{
    id: string
    campaignId: string
    authorId: string
    authorUsername: string
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    createdAt: Date
    editedAt: Date | null
    deletedAt: Date | null
    deletedBy: string | null
  }>
> {
  const rows = await prisma.chatMessage.findMany({
    where: {
      campaignId,
      ...(since
        ? {
            createdAt: {
              gte: since,
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
  })

  return rows
    .filter((row): row is typeof row & { campaignId: string } => row.campaignId !== null)
    .map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      content: row.content,
      type: row.type,
      isDmOnly: row.isDmOnly,
      isOffTheRecord: row.isOffTheRecord,
      visibleTo: row.visibleTo,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
    }))
}

/**
 * List campaign messages with pagination (backward/before pagination)
 * @param params campaignId, optional before timestamp, limit
 * @returns Paginated campaign messages and hasMore flag
 */
export async function listCampaignMessagesPage(params: {
  campaignId: string
  since?: Date
  before?: Date
  limit: number
}): Promise<{
  rows: Array<{
    id: string
    campaignId: string
    authorId: string
    authorUsername: string
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    createdAt: Date
    editedAt: Date | null
    deletedAt: Date | null
    deletedBy: string | null
  }>
  hasMore: boolean
}> {
  const queryLimit = Math.max(1, Math.min(100, params.limit))
  const createdAtFilter = {
    ...(params.since
      ? {
          gte: params.since,
        }
      : {}),
    ...(params.before
      ? {
          lt: params.before,
        }
      : {}),
  }

  const rows = await prisma.chatMessage.findMany({
    where: {
      campaignId: params.campaignId,
      ...(Object.keys(createdAtFilter).length > 0
        ? {
            createdAt: createdAtFilter,
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: queryLimit + 1,
  })

  const hasMore = rows.length > queryLimit
  const page = (hasMore ? rows.slice(0, queryLimit) : rows).reverse()

  return {
    rows: page
      .filter((row): row is typeof row & { campaignId: string } => row.campaignId !== null)
      .map((row) => ({
        id: row.id,
        campaignId: row.campaignId,
        authorId: row.authorId,
        authorUsername: row.authorUsername,
        content: row.content,
        type: row.type,
        isDmOnly: row.isDmOnly,
        isOffTheRecord: row.isOffTheRecord,
        visibleTo: row.visibleTo,
        createdAt: row.createdAt,
        editedAt: row.editedAt,
        deletedAt: row.deletedAt,
        deletedBy: row.deletedBy,
      })),
    hasMore,
  }
}

/**
 * Delete all greenroom messages for a campaign
 * Typically called during campaign deletion
 * @param campaignId Campaign UUID
 */
export async function deleteCampaignMessages(campaignId: string): Promise<void> {
  await prisma.chatMessage.deleteMany({
    where: { campaignId },
  })
}

export async function findLatestSessionStartBoundaryTimestamp(
  sessionId: string
): Promise<Date | null> {
  const latest = await prisma.chatMessage.findFirst({
    where: {
      sessionId,
      type: 'SYSTEM',
      OR: [
        { content: { startsWith: '[Session Started]' } },
        { content: { startsWith: 'Session Start:' } },
      ],
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      createdAt: true,
    },
  })

  return latest?.createdAt ?? null
}

export async function getChatCounts(): Promise<{
  totalMessages: number
  messagesLastMinute: number
  activeChatSessions: number
}> {
  const oneMinuteAgo = new Date(Date.now() - 60_000)

  const [totalMessages, messagesLastMinute, distinctSessions] = await Promise.all([
    prisma.chatMessage.count(),
    prisma.chatMessage.count({ where: { createdAt: { gte: oneMinuteAgo } } }),
    prisma.chatMessage.findMany({
      distinct: ['sessionId'],
      where: { sessionId: { not: null } },
      select: { sessionId: true },
    }),
  ])

  return {
    totalMessages,
    messagesLastMinute,
    activeChatSessions: distinctSessions.length,
  }
}
