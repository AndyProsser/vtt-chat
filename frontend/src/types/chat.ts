import type { MessageType, UUID } from '@shared'

export interface Message {
  id: UUID
  authorId: UUID
  authorUsername: string
  content: string
  type: MessageType
  isDmOnly: boolean
  createdAt: number
  editedAt?: number
}

export interface TypingIndicator {
  userId: UUID
  username: string
  /** Timestamp when typing indicator should expire. */
  until: number
}

export interface ChatDraft {
  content: string
  isDmOnly: boolean
}
