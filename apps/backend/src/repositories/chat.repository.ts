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
  type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
  isDmOnly: boolean
  isOffTheRecord?: boolean
  visibleTo?: unknown
  metadata?: unknown
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
      metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : undefined,
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
    type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    metadata: unknown
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
    type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    metadata: unknown
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
    metadata: row.metadata,
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
  types?: Array<'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'>
}): Promise<{
  rows: Array<{
    id: string
    sessionId: string
    authorId: string
    authorUsername: string
    authorCharacterName: string | null
    content: string
    type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    metadata: unknown
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
      ...(params.types && params.types.length > 0
        ? {
            type: {
              in: params.types,
            },
          }
        : {}),
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

  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: { campaignId: true },
  })

  const authorCharacterNameByUserId = new Map<string, string>()
  if (session?.campaignId) {
    const authorIds = Array.from(new Set(page.map((row: any) => row.authorId)))
    if (authorIds.length > 0) {
      const activeCharacters = await prisma.character.findMany({
        where: {
          campaignId: session.campaignId,
          userId: { in: authorIds },
          isActive: true,
        },
        select: {
          userId: true,
          name: true,
        },
      })

      activeCharacters.forEach((character) => {
        authorCharacterNameByUserId.set(character.userId, character.name)
      })
    }
  }

  return {
    rows: page.map((row: any) => ({
      id: row.id,
      sessionId: row.sessionId,
      authorId: row.authorId,
      authorUsername: row.authorUsername,
      authorCharacterName: authorCharacterNameByUserId.get(row.authorId) ?? null,
      content: row.content,
      type: row.type,
      isDmOnly: row.isDmOnly,
      isOffTheRecord: row.isOffTheRecord,
      visibleTo: row.visibleTo,
      metadata: row.metadata,
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
    type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    metadata: unknown
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
    metadata: row.metadata,
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
    type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    metadata: unknown
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
      metadata: row.metadata,
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
  type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
  isDmOnly: boolean
  isOffTheRecord: boolean
  visibleTo: unknown
  metadata: unknown
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
    metadata: row.metadata,
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
    type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    metadata: unknown
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
    type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    metadata: unknown
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
      metadata: row.metadata,
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
    type: 'IC' | 'OOC' | 'WHISPER' | 'DM' | 'SYSTEM' | 'ROLL'
    isDmOnly: boolean
    isOffTheRecord: boolean
    visibleTo: unknown
    metadata: unknown
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
        metadata: row.metadata,
        createdAt: row.createdAt,
        editedAt: row.editedAt,
        deletedAt: row.deletedAt,
        deletedBy: row.deletedBy,
      })),
    hasMore,
  }
}

export async function hasCampaignMessagesBefore(params: {
  campaignId: string
  before: Date
}): Promise<boolean> {
  const row = await prisma.chatMessage.findFirst({
    where: {
      campaignId: params.campaignId,
      createdAt: {
        lt: params.before,
      },
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return row !== null
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

/**
 * Counts non-deleted messages for a session, optionally filtering by a since timestamp.
 * Used to provide an approximate total for the chat header indicator.
 */
export async function countSessionMessages(sessionId: string, since?: Date): Promise<number> {
  return prisma.chatMessage.count({
    where: {
      sessionId,
      deletedAt: null,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
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

/**
 * Removes the visibleTo audience restriction from all MAIN room messages in a session.
 * Keeps the roomId key intact so room-scoped queries still work.
 * Called when a session reaches ENDED so history is readable by all campaign members.
 */
export async function clearMainRoomMessageAudience(
  sessionId: string,
  mainRoomId: string
): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE "ChatMessage"
    SET "visibleTo" = "visibleTo" - 'visibleTo'
    WHERE "sessionId" = ${sessionId}::uuid
      AND "visibleTo" IS NOT NULL
      AND "visibleTo" ->> 'roomId' = ${mainRoomId}
  `
  return result
}
