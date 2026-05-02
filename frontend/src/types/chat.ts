import type { MessageEntity, UUID } from '@shared'

export type Message = MessageEntity

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
