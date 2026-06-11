import type { NoteAttachmentEntity, NoteEntity, NoteVisibility, UUID } from '@shared'

export type Note = NoteEntity

export interface NoteDraft {
  title: string
  content: string
  visibility: NoteVisibility
  tags: string[]
  allowedUsers?: UUID[]
  attachments?: NoteAttachmentEntity[]
}
