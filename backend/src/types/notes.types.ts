import type { NoteEntity, UUID } from '@shared'

export interface StoredNote extends NoteEntity {
  campaignId?: UUID
  sessionId: UUID
  authorId: UUID
  authorUsername: string
}
