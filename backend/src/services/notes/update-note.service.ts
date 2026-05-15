import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'
import {
  findNoteById as findNoteRecordById,
  updateNoteRecord,
} from '@/repositories/notes.repository'
import { mapStoredNote } from '@/services/notes/shared'

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
