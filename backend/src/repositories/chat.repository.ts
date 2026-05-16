import { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export async function createChatMessageRecord(params: {
  id: string
  sessionId: string
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
      sessionId: params.sessionId,
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
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId },
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

  const rows = await prisma.chatMessage.findMany({
    where: {
      sessionId: params.sessionId,
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
} | null> {
  const row = await prisma.chatMessage.findUnique({
    where: { id: messageId },
  })

  if (!row) return null

  return {
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
      select: { sessionId: true },
    }),
  ])

  return {
    totalMessages,
    messagesLastMinute,
    activeChatSessions: distinctSessions.length,
  }
}
