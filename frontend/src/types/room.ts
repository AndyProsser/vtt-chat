import type { PresenceEntity, PresenceState, RoomEntity, SessionState, UUID } from '@shared'

export type Room = RoomEntity

export interface RoomUser {
  userId: UUID
  username: string
  playerName?: string
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  presenceState: PresenceState
  ghost?: boolean
  joinedAt: number
}

export type SessionPresence = PresenceEntity

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
