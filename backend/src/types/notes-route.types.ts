import type { NoteVisibility, UUID } from '@shared'

export interface NotesCreateRequest {
  sessionId: UUID
  title: string
  content: string
  visibility: NoteVisibility
  tags: string[]
  allowedUsers: UUID[]
}

export interface NotesUpdateRequest {
  noteId: UUID
  title?: string
  content?: string
  visibility?: NoteVisibility
  tags?: string[]
  allowedUsers?: UUID[]
}
