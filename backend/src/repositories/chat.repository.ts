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
  visibleTo?: string[]
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
    visibleTo: row.visibleTo,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    deletedBy: row.deletedBy,
  }))
}

export async function findMessageById(messageId: string): Promise<{
  id: string
  sessionId: string
  authorId: string
  authorUsername: string
  content: string
  type: 'IC' | 'OOC' | 'WHISPER' | 'SYSTEM'
  isDmOnly: boolean
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
