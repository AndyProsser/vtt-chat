import { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export async function createNoteRecord(params: {
  id: string
  sessionId: string
  authorId: string
  authorUsername: string
  title: string
  content: string
  visibility: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
  tags: string[]
  allowedUsers: string[]
  attachments: Prisma.InputJsonValue
  createdAt: Date
  updatedAt: Date
}): Promise<void> {
  await prisma.note.create({
    data: {
      id: params.id,
      sessionId: params.sessionId,
      authorId: params.authorId,
      authorUsername: params.authorUsername,
      title: params.title,
      content: params.content,
      visibility: params.visibility,
      tags: params.tags as Prisma.InputJsonValue,
      allowedUsers: params.allowedUsers as Prisma.InputJsonValue,
      attachments: params.attachments,
      createdAt: params.createdAt,
      updatedAt: params.updatedAt,
    },
  })
}

export async function listSessionNotes(sessionId: string): Promise<
  Array<{
    id: string
    campaignId: string | null
    sessionId: string
    authorId: string
    authorUsername: string
    title: string
    content: string
    visibility: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
    tags: unknown
    allowedUsers: unknown
    attachments: unknown
    publishedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }>
> {
  const rows = await prisma.note.findMany({
    where: { sessionId },
    orderBy: { updatedAt: 'desc' },
    include: {
      session: {
        select: {
          campaignId: true,
        },
      },
    },
  })

  return rows.map((row: any) => ({
    id: row.id,
    campaignId: row.session.campaignId,
    sessionId: row.sessionId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    title: row.title,
    content: row.content,
    visibility: row.visibility,
    tags: row.tags,
    allowedUsers: row.allowedUsers,
    attachments: row.attachments,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function listCampaignNotes(campaignId: string): Promise<
  Array<{
    id: string
    campaignId: string | null
    sessionId: string
    authorId: string
    authorUsername: string
    title: string
    content: string
    visibility: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
    tags: unknown
    allowedUsers: unknown
    attachments: unknown
    publishedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }>
> {
  const rows = await prisma.note.findMany({
    where: {
      session: {
        campaignId,
      },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      session: {
        select: {
          campaignId: true,
        },
      },
    },
  })

  return rows.map((row: any) => ({
    id: row.id,
    campaignId: row.session.campaignId,
    sessionId: row.sessionId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    title: row.title,
    content: row.content,
    visibility: row.visibility,
    tags: row.tags,
    allowedUsers: row.allowedUsers,
    attachments: row.attachments,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export async function findNoteById(noteId: string): Promise<{
  id: string
  campaignId: string | null
  sessionId: string
  authorId: string
  authorUsername: string
  title: string
  content: string
  visibility: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
  tags: unknown
  allowedUsers: unknown
  attachments: unknown
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
} | null> {
  const row = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      session: {
        select: {
          campaignId: true,
        },
      },
    },
  })

  if (!row) return null

  return {
    id: row.id,
    campaignId: row.session.campaignId,
    sessionId: row.sessionId,
    authorId: row.authorId,
    authorUsername: row.authorUsername,
    title: row.title,
    content: row.content,
    visibility: row.visibility,
    tags: row.tags,
    allowedUsers: row.allowedUsers,
    attachments: row.attachments,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function updateNoteRecord(params: {
  noteId: string
  title: string
  content: string
  visibility: 'DM_ONLY' | 'PLAYERS_VISIBLE' | 'CUSTOM'
  tags: string[]
  allowedUsers: string[]
  attachments: Prisma.InputJsonValue
  updatedAt: Date
  publishedAt?: Date | null
}): Promise<void> {
  await prisma.note.update({
    where: { id: params.noteId },
    data: {
      title: params.title,
      content: params.content,
      visibility: params.visibility,
      tags: params.tags as Prisma.InputJsonValue,
      allowedUsers: params.allowedUsers as Prisma.InputJsonValue,
      attachments: params.attachments,
      updatedAt: params.updatedAt,
      publishedAt: params.publishedAt,
    },
  })
}

export async function deleteNoteRecord(noteId: string): Promise<void> {
  await prisma.note.delete({
    where: { id: noteId },
  })
}
