import { RoomType, type UUID } from '@shared'

export interface NotesPublishRoom {
  id: UUID
  name: string
  type: RoomType
}

export interface NotesPublishTarget {
  audience: 'EVERYONE' | 'ROOM' | 'ALL_ROOMS'
  roomId?: UUID | null
  roomIds?: UUID[] // For ALL_ROOMS: list of all room IDs to publish to
}

/** Target for the /surface endpoint — excerpt-based, scope-based handout delivery. */
export interface NotesSurfaceTarget {
  scope: 'PARTY' | 'SELECTED'
  selectedUserIds?: UUID[]
  manualExcerpt?: string
}
