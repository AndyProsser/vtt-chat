import type { MessageEntity, UUID } from '@shared'

export interface StoredMessage extends MessageEntity {
  sessionId: UUID
  authorUsername: string
  isDmOnly: boolean
  isOffTheRecord: boolean
  visibleTo?: UUID[]
  targetIds?: UUID[]
  editedAt?: number
  deletedAt?: number
  deletedBy?: UUID
}
