import type { NoteVisibility, UUID } from '@shared'

export interface Note {
  id: UUID
  ownerId: UUID
  ownerUsername: string
  title: string
  content: string
  visibility: NoteVisibility
  tags: string[]
  allowedUsers?: UUID[]
  publishedAt?: number
  createdAt: number
  updatedAt: number
}

export interface NoteDraft {
  title: string
  content: string
  visibility: NoteVisibility
  tags: string[]
  allowedUsers?: UUID[]
}
