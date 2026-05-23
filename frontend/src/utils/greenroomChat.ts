import type { MessageEntity, UUID } from '@shared'

export type GreenroomApiMessage = {
  id: UUID
  roomId: UUID
  authorId: UUID
  authorUsername: string
  content: string
  type: MessageEntity['type']
  isDmOnly?: boolean
  isOffTheRecord?: boolean
  visibleTo?: UUID[]
  targetIds?: UUID[]
  createdAt: number
}

export function toGreenroomStoreMessage(message: GreenroomApiMessage): GreenroomApiMessage {
  return {
    id: message.id,
    roomId: message.roomId,
    authorId: message.authorId,
    authorUsername: message.authorUsername,
    content: message.content,
    type: message.type,
    isDmOnly: message.isDmOnly,
    isOffTheRecord: message.isOffTheRecord,
    visibleTo: message.visibleTo,
    targetIds: message.targetIds,
    createdAt: message.createdAt,
  }
}
