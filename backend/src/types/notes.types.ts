import type { NoteEntity, UUID } from '@shared'

export interface StoredNote extends NoteEntity {
  sessionId: UUID
  authorId: UUID
  authorUsername: string
}
