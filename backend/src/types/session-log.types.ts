import type { UUID } from '@shared'

export interface SessionLogData {
  sessionId: UUID
  userId?: UUID
  username: string
  eventType: 'JOINED' | 'LEFT' | 'STATE_CHANGED'
  detail?: string
}

export interface SessionLogEntry {
  id: UUID
  sessionId: UUID
  userId: UUID | null
  username: string
  eventType: string
  detail: string | null
  createdAt: Date
}
