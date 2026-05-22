import type { NoteVisibility, UUID } from '@shared'

export interface NotesCreateRequest {
  campaignId: UUID
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
