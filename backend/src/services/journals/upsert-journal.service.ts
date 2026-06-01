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

/**
 * Create or update the journal for a specific session.
 * Since there is exactly one journal per session, this operation:
 * - Creates a new journal if none exists
 * - Updates the existing journal if one already exists
 *
 * @param sessionId - The session to journal for
 * @param title - Journal title
 * @param content - Journal markdown content
 * @param authorId - DM user ID
 * @param authorUsername - DM username
 * @param tags - Additional tags (the _journal tag is always added)
 * @returns Updated/created journal note
 */
export async function createOrUpdateSessionJournal(params: {
  campaignId: UUID
  sessionId: UUID
  title: string
  content: string
  authorId: UUID
  authorUsername: string
  tags?: string[]
}): Promise<StoredNote & { created: boolean }> {
  // Find existing journal in this session
  const notes = await listSessionNotes(params.sessionId)
  const existingJournal = notes.find((note) => {
    const tags = Array.isArray(note.tags) ? (note.tags as string[]) : []
    return tags.includes(JOURNAL_TAG) || note.title === 'Session Journal'
  })

  const now = Date.now()
  const journalTags = [JOURNAL_TAG, ...(params.tags ?? [])]

  if (existingJournal) {
    // Update existing journal
    await updateNoteRecord({
      noteId: existingJournal.id,
      title: params.title,
      content: params.content,
      visibility: NoteVisibility.PLAYERS_VISIBLE,
      tags: journalTags,
      allowedUsers: [],
      attachments: {} as any,
      updatedAt: new Date(now),
      publishedAt: existingJournal.publishedAt,
    })

    return {
      ...mapStoredNote(existingJournal),
      title: params.title,
      content: params.content,
      visibility: NoteVisibility.PLAYERS_VISIBLE,
      tags: journalTags,
      allowedUsers: [],
      attachments: [],
      updatedAt: now,
      created: false,
    }
  }

  // Create new journal
  const journalId = randomUUID() as UUID
  const newJournal: StoredNote = {
    id: journalId,
    campaignId: params.campaignId,
    sessionId: params.sessionId,
    authorId: params.authorId,
    authorUsername: params.authorUsername,
    title: params.title,
    content: params.content,
    visibility: NoteVisibility.PLAYERS_VISIBLE,
    tags: journalTags,
    allowedUsers: [],
    attachments: [],
    createdAt: now,
    updatedAt: now,
  }

  await createNoteRecord({
    id: newJournal.id,
    campaignId: newJournal.campaignId,
    sessionId: newJournal.sessionId ?? null,
    authorId: newJournal.authorId,
    authorUsername: newJournal.authorUsername,
    title: newJournal.title,
    content: newJournal.content,
    visibility: newJournal.visibility,
    tags: newJournal.tags,
    allowedUsers: [],
    attachments: {} as any,
    createdAt: new Date(newJournal.createdAt),
    updatedAt: new Date(newJournal.updatedAt),
  })

  return { ...newJournal, created: true }
}
