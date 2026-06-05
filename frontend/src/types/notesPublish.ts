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

/** Target for the /surface endpoint — excerpt-based, scope-based handout delivery. */
export interface NotesSurfaceTarget {
  scope: 'PARTY' | 'SELECTED'
  selectedUserIds?: UUID[]
  manualExcerpt?: string
}
