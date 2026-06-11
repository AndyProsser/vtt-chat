import { randomUUID } from 'node:crypto'
import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'
import {
  createNoteRecord,
  listSessionNotes,
  updateNoteRecord,
} from '@/repositories/notes.repository'
import { mapStoredNote } from '@/services/notes/shared'

const JOURNAL_TAG = '_journal'

function isJournalNoteCandidate(params: { title: string; tags?: string[] }): boolean {
  return params.tags?.includes(JOURNAL_TAG) || params.title === 'Session Journal'
}

export async function createNote(params: {
  campaignId: UUID
  sessionId?: UUID
  authorId: UUID
  authorUsername: string
  title: string
  content: string
  visibility: NoteVisibility
  tags?: string[]
  allowedUsers?: UUID[]
  attachments?: StoredNote['attachments']
}): Promise<StoredNote & { created: boolean }> {
  if (isJournalNoteCandidate({ title: params.title, tags: params.tags })) {
    const existingJournal = params.sessionId
      ? (await listSessionNotes(params.sessionId)).find((row) => {
          const tags = Array.isArray(row.tags) ? (row.tags as string[]) : []
          return tags.includes(JOURNAL_TAG) || row.title === 'Session Journal'
        })
      : undefined

    if (existingJournal) {
      const now = Date.now()
      await updateNoteRecord({
        noteId: existingJournal.id,
        title: params.title,
        content: params.content,
        visibility: params.visibility,
        tags: params.tags || [],
        allowedUsers: params.allowedUsers || [],
        attachments: (params.attachments || []) as any,
        updatedAt: new Date(now),
        publishedAt: existingJournal.publishedAt,
      })

      return {
        ...mapStoredNote(existingJournal),
        title: params.title,
        content: params.content,
        visibility: params.visibility,
        tags: params.tags || [],
        allowedUsers: params.allowedUsers,
        attachments: params.attachments || [],
        updatedAt: now,
        created: false,
      }
    }
  }

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
    attachments: params.attachments || [],
    createdAt: now,
    updatedAt: now,
  }

  await createNoteRecord({
    id: note.id,
    campaignId: note.campaignId,
    sessionId: note.sessionId ?? null,
    authorId: note.authorId,
    authorUsername: note.authorUsername,
    title: note.title,
    content: note.content,
    visibility: note.visibility,
    tags: note.tags,
    allowedUsers: note.allowedUsers || [],
    attachments: (note.attachments || []) as any,
    createdAt: new Date(note.createdAt),
    updatedAt: new Date(note.updatedAt),
  })

  return { ...note, created: true }
}
