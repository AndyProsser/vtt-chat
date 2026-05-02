import type { NoteVisibility, UUID } from '@shared'

export interface StoredNote {
  id: UUID
  sessionId: UUID
  authorId: UUID
  authorUsername: string
  title: string
  content: string
  visibility: NoteVisibility
  tags: string[]
  allowedUsers?: UUID[]
  publishedAt?: number
  createdAt: number
  updatedAt: number
}
