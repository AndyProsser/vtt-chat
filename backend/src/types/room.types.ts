import type { PresenceEntity, PresenceState, RoomEntity, UUID } from '@shared'

export interface StoredRoom extends RoomEntity {
  createdBy: UUID
  updatedAt: number
}

export interface RealtimePresence extends PresenceEntity {
  sessionId: UUID
  campaignId?: UUID
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
