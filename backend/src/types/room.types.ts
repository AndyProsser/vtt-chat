import type { PresenceState, RoomType, UUID } from '@shared'

export interface StoredRoom {
  id: UUID
  sessionId: UUID
  name: string
  type: RoomType
  createdBy: UUID
  createdAt: number
  updatedAt: number
}

export interface RealtimePresence {
  sessionId: UUID
  campaignId?: UUID
  userId: UUID
  username: string
  primaryRoomId?: UUID
  privateRoomId?: UUID
  state: PresenceState
  lastSeenAt: number
}

export interface SessionTransitionUser {
  id: UUID
  username: string
}

export interface SessionRoomTransitionResult {
  mainRoomId: UUID
  mainRoomName: string
  greenRoomId: UUID
  greenRoomName: string
  targetRoomId: UUID
  targetRoomName: string
  movedUsers: number
  targetState: PresenceState
}
