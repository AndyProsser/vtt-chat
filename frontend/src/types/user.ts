import type { PresenceState, Role, UUID } from '@shared'

export interface User {
  id: UUID
  username: string
  role: Role
}

export interface SessionUser {
  id: UUID
  username: string
  displayName?: string
  role: Role
  presence: PresenceState
  joinedAt: number
}

export interface UserSummary {
  id: UUID
  username: string
}

export interface UserPreferences {
  pushToTalk: boolean
  autoJoinAudio: boolean
  compactChat: boolean
}
