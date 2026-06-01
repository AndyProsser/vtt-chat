import { NoteVisibility } from '@shared'
import type { UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'
import { listSessionNotes } from '@/repositories/notes.repository'
import { mapStoredNote } from '@/services/notes/shared'

const JOURNAL_TAG = '_journal'

/**
 * Get the journal for a specific session.
 * There is at most one journal per session (identified by the _journal tag).
 * Returns null if no journal exists yet.
 */
export async function getSessionJournal(sessionId: UUID): Promise<StoredNote | null> {
  const notes = await listSessionNotes(sessionId)
  const journal = notes.find((note) => {
    const tags = Array.isArray(note.tags) ? (note.tags as string[]) : []
    return tags.includes(JOURNAL_TAG) || note.title === 'Session Journal'
  })

  return journal ? mapStoredNote(journal) : null
}
