import type { UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'
import {
  findNoteById as findNoteRecordById,
  listSessionNotes,
} from '@/repositories/notes.repository'
import { canViewNote, mapStoredNote } from '@/services/notes/shared'

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
