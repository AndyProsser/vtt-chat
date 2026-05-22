export { createNote } from '@/services/notes/create-note.service'
export {
  getVisibleNotes,
  getVisibleCampaignNotes,
  getNoteById,
} from '@/services/notes/read-notes.service'
export { updateNote, markNotePublished } from '@/services/notes/update-note.service'
export { deleteNote } from '@/services/notes/delete-note.service'

export function __resetNotesStoreForTests(): void {
  // No-op in Prisma-backed mode. Tests should mock repository calls.
}
