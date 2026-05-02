import type { SessionState, UUID } from '@shared'

export interface Session {
  id: UUID
  name: string
  dmId: UUID
  state: SessionState
  description?: string
  createdAt: number
  startedAt?: number
  pausedAt?: number
  endedAt?: number
}
