import { NoteVisibility } from '@shared'
import type { NoteAttachmentEntity, UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'

export interface NoteRecordRow {
  id: string
  campaignId: string
  sessionId: string | null
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
}

export function parseUUIDArray(value: unknown): UUID[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is UUID => typeof item === 'string')
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function parseNoteAttachments(value: unknown): NoteAttachmentEntity[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const candidate = item as Record<string, unknown>
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.mime !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.uri !== 'string'
    ) {
      return []
    }

    const rawCreatedAt =
      typeof candidate.createdAt === 'number'
        ? candidate.createdAt
        : Number.isFinite(Number(candidate.createdAt))
          ? Number(candidate.createdAt)
          : 0

    return [
      {
        id: candidate.id as UUID,
        campaignId:
          typeof candidate.campaignId === 'string' ? (candidate.campaignId as UUID) : undefined,
        mime: candidate.mime,
        name: candidate.name,
        uri: candidate.uri,
        createdAt: Math.max(0, Math.floor(rawCreatedAt)),
      },
    ]
  })
}

export function canViewNote(note: StoredNote, requesterId: UUID, requesterRole: string): boolean {
  if (requesterRole === 'DM') return true
  if (note.authorId === requesterId) return true

  if (note.visibility === NoteVisibility.DM_ONLY) {
    return false
  }

  if (note.visibility === NoteVisibility.PLAYERS_VISIBLE) {
    return true
  }

  return (note.allowedUsers || []).includes(requesterId)
}

export function mapStoredNote(row: NoteRecordRow): StoredNote {
  return {
    id: row.id as UUID,
    campaignId: row.campaignId as UUID,
    sessionId: row.sessionId ? (row.sessionId as UUID) : undefined,
    authorId: row.authorId as UUID,
    authorUsername: row.authorUsername,
    title: row.title,
    content: row.content,
    visibility: row.visibility as NoteVisibility,
    tags: parseStringArray(row.tags),
    allowedUsers: parseUUIDArray(row.allowedUsers),
    attachments: parseNoteAttachments(row.attachments),
    publishedAt: row.publishedAt?.getTime(),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}
