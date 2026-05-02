import type { MessageType, UUID } from '@shared'

export interface StoredMessage {
  id: UUID
  sessionId: UUID
  authorId: UUID
  authorUsername: string
  content: string
  type: MessageType
  isDmOnly: boolean
  visibleTo?: UUID[]
  createdAt: number
  editedAt?: number
  deletedAt?: number
  deletedBy?: UUID
}
