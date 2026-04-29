import type { PresenceState, RoomType, SessionState, UUID } from '@shared'

export interface SessionRoom {
  id: UUID
  sessionId: UUID
  name: string
  type: RoomType
  createdAt: number
  createdBy: UUID
}

export interface SessionRoomMember {
  userId: UUID
  username: string
  presenceState: PresenceState
  joinedAt: number
}

export interface SessionPresenceEntry {
  userId: UUID
  username: string
  state: PresenceState
  primaryRoomId?: UUID
  privateRoomId?: UUID
  lastSeenAt: number
}

export interface SessionTransitionSummary {
  eventId: string
  sessionId: UUID
  previousState: SessionState | null
  nextState: SessionState
  movedUsers: number
  targetRoomId: UUID
  targetRoomName: string
  timestamp: number
}
