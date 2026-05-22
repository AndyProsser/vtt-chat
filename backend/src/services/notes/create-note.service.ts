import { randomUUID } from 'node:crypto'
import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'
import { createNoteRecord } from '@/repositories/notes.repository'

export async function createNote(params: {
  campaignId?: UUID
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
    campaignId: params.campaignId,
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
