import type { PresenceState, RoomType, SessionState, UUID } from '@shared'

export interface Room {
  id: UUID
  sessionId: UUID
  name: string
  type: RoomType
  createdAt: number
  createdBy: UUID
}

export interface RoomUser {
  userId: UUID
  username: string
  presenceState: PresenceState
  joinedAt: number
}

export interface SessionPresence {
  userId: UUID
  username: string
  state: PresenceState
  primaryRoomId?: UUID
  privateRoomId?: UUID
  lastSeenAt: number
}

export interface SessionTransitionNotice {
  eventId: string
  sessionId: UUID
  previousState: SessionState | null
  nextState: SessionState
  movedUsers: number
  targetState: PresenceState
  targetRoomId: UUID
  targetRoomName: string
  timestamp: number
}
