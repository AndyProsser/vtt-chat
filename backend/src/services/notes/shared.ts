import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'

export interface NoteRecordRow {
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
    campaignId: row.campaignId ? (row.campaignId as UUID) : undefined,
    sessionId: row.sessionId as UUID,
    authorId: row.authorId as UUID,
    authorUsername: row.authorUsername,
    title: row.title,
    content: row.content,
    visibility: row.visibility as NoteVisibility,
    tags: parseStringArray(row.tags),
    allowedUsers: parseUUIDArray(row.allowedUsers),
    publishedAt: row.publishedAt?.getTime(),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}
