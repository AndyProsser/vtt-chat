import type { MessageType, UUID } from '@shared'

export interface ChatMessage {
  id: UUID
  sessionId: UUID
  authorId: UUID
  authorUsername: string
  content: string
  type: MessageType
  isDmOnly: boolean
  createdAt: number
  editedAt?: number
}

export interface ChatTypingState {
  userId: UUID
  username: string
  until: number
}

export interface ChatDraft {
  content: string
  isDmOnly: boolean
}
