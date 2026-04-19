import { randomUUID } from 'crypto'
import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import {
  createNoteRecord,
  deleteNoteRecord,
  findNoteById as findNoteRecordById,
  listSessionNotes,
  updateNoteRecord,
} from '@/repositories/notes.repository'

export interface StoredNote {
  id: UUID
  sessionId: UUID
  authorId: UUID
  authorUsername: string
  title: string
  content: string
  visibility: NoteVisibility
  tags: string[]
  allowedUsers?: UUID[]
  publishedAt?: number
  createdAt: number
  updatedAt: number
}

function parseUUIDArray(value: unknown): UUID[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is UUID => typeof item === 'string')
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function canViewNote(note: StoredNote, requesterId: UUID, requesterRole: string): boolean {
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

function mapStoredNote(row: {
  id: string
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
}): StoredNote {
  return {
    id: row.id as UUID,
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

export async function createNote(params: {
  sessionId: UUID
  authorId: UUID
  authorUsername: string
  title: string
  content: string
  visibility: NoteVisibility
  tags?: string[]
  allowedUsers?: UUID[]
}): Promise<StoredNote> {
  const now = Date.now()
  const note: StoredNote = {
    id: randomUUID() as UUID,
    sessionId: params.sessionId,
    authorId: params.authorId,
    authorUsername: params.authorUsername,
    title: params.title,
    content: params.content,
    visibility: params.visibility,
    tags: params.tags || [],
    allowedUsers: params.allowedUsers,
    createdAt: now,
    updatedAt: now,
  }

  await createNoteRecord({
    id: note.id,
    sessionId: note.sessionId,
    authorId: note.authorId,
    authorUsername: note.authorUsername,
    title: note.title,
    content: note.content,
    visibility: note.visibility,
    tags: note.tags,
    allowedUsers: note.allowedUsers || [],
    createdAt: new Date(note.createdAt),
    updatedAt: new Date(note.updatedAt),
  })

  return note
}

export async function getVisibleNotes(
  sessionId: UUID,
  requesterId: UUID,
  requesterRole: string
): Promise<StoredNote[]> {
  const rows = await listSessionNotes(sessionId)
  const notes = rows.map(mapStoredNote)
  return notes.filter((note) => canViewNote(note, requesterId, requesterRole))
}

export async function getNoteById(noteId: UUID): Promise<StoredNote | null> {
  const row = await findNoteRecordById(noteId)
  return row ? mapStoredNote(row) : null
}

export async function updateNote(
  noteId: UUID,
  requesterId: UUID,
  requesterRole: string,
  updates: Partial<Pick<StoredNote, 'title' | 'content' | 'visibility' | 'tags' | 'allowedUsers'>>
): Promise<StoredNote | null> {
  const row = await findNoteRecordById(noteId)
  if (!row) return null

  const note = mapStoredNote(row)
  const canMutate = requesterRole === 'DM' || note.authorId === requesterId
  if (!canMutate) return null

  const requestedVisibility = updates.visibility ?? note.visibility
  const requestedAllowedUsers = updates.allowedUsers ?? note.allowedUsers ?? []

  // Player-authored notes can only increase sharing, never reduce it.
  if (requesterRole !== 'DM') {
    if (
      note.visibility === NoteVisibility.PLAYERS_VISIBLE &&
      requestedVisibility !== NoteVisibility.PLAYERS_VISIBLE
    ) {
      const error = new Error('Players cannot reduce visibility from shared notes') as Error & {
        code: string
      }
      error.code = 'VISIBILITY_CONSTRAINT'
      throw error
    }

    if (note.visibility === NoteVisibility.CUSTOM) {
      if (requestedVisibility === NoteVisibility.DM_ONLY) {
        const error = new Error('Players cannot convert custom notes to DM-only') as Error & {
          code: string
        }
        error.code = 'VISIBILITY_CONSTRAINT'
        throw error
      }

      const previous = new Set(note.allowedUsers || [])
      const next = new Set(requestedAllowedUsers)
      for (const userId of previous) {
        if (!next.has(userId)) {
          const error = new Error(
            'Players cannot remove users from custom share lists'
          ) as Error & {
            code: string
          }
          error.code = 'VISIBILITY_CONSTRAINT'
          throw error
        }
      }
    }
  }

  const next: StoredNote = {
    ...note,
    title: updates.title ?? note.title,
    content: updates.content ?? note.content,
    visibility: updates.visibility ?? note.visibility,
    tags: updates.tags ?? note.tags,
    allowedUsers: updates.allowedUsers ?? note.allowedUsers,
    updatedAt: Date.now(),
  }

  await updateNoteRecord({
    noteId,
    title: next.title,
    content: next.content,
    visibility: next.visibility,
    tags: next.tags,
    allowedUsers: next.allowedUsers || [],
    updatedAt: new Date(next.updatedAt),
    publishedAt: next.publishedAt ? new Date(next.publishedAt) : null,
  })

  return next
}

export async function markNotePublished(noteId: UUID): Promise<StoredNote | null> {
  const row = await findNoteRecordById(noteId)
  if (!row) return null

  const note = mapStoredNote(row)
  const now = Date.now()
  const next: StoredNote = {
    ...note,
    publishedAt: now,
    updatedAt: now,
  }

  await updateNoteRecord({
    noteId,
    title: next.title,
    content: next.content,
    visibility: next.visibility,
    tags: next.tags,
    allowedUsers: next.allowedUsers || [],
    updatedAt: new Date(now),
    publishedAt: new Date(now),
  })

  return next
}

export function __resetNotesStoreForTests(): void {
  // No-op in Prisma-backed mode. Tests should mock repository calls.
}

export async function deleteNote(
  noteId: UUID,
  requesterId: UUID,
  requesterRole: string
): Promise<StoredNote | null> {
  const row = await findNoteRecordById(noteId)
  if (!row) return null

  const note = mapStoredNote(row)
  const canMutate = requesterRole === 'DM' || note.authorId === requesterId
  if (!canMutate) return null

  await deleteNoteRecord(noteId)
  return note
}
