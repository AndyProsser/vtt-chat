import { RoomType, type UUID } from '@shared'

export interface NotesPublishRoom {
  id: UUID
  name: string
  type: RoomType
}

export interface NotesPublishTarget {
  audience: 'EVERYONE' | 'ROOM'
  roomId?: UUID | null
}
