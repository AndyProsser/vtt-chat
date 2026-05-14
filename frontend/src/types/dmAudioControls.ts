import type { PresenceState, Role, RoomType, UUID } from '@shared'

export interface AudioRoomOption {
  id: UUID
  name: string
  type: RoomType
}

export interface ParticipantOption {
  userId: UUID
  username: string
  state: PresenceState
  primaryRoomId?: UUID
}

export interface AudioPreset {
  id: string
  name: string
  category: 'VOICE' | 'DISTANCE' | 'ENVIRONMENT' | 'CONDITION' | 'IC'
}

export interface DMAudioControlsProps {
  apiUrl: string
  token: string
  role: Role
  sessionId: UUID
  dmUserId: UUID
  rooms: AudioRoomOption[]
  participants: ParticipantOption[]
}

export interface PendingOverride {
  userId: UUID
  overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER'
  expectedAppliedAt: number
  startedAt: number
}

export interface PendingMove {
  userId: UUID
  username: string
  fromRoomId?: UUID
  toRoomId: UUID
  startedAt: number
}
