import type { UUID } from '@shared'
import type { StoredNote } from '@/types/notes.types'
import {
  deleteNoteRecord,
  findNoteById as findNoteRecordById,
} from '@/repositories/notes.repository'
import { mapStoredNote } from '@/services/notes/shared'

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
