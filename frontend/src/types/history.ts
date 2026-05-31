import type { MessageMetadataEntity } from '@shared'

export interface SessionHistoryMessage {
  id: string
  sessionId: string
  roomId?: string
  authorId: string
  targetIds?: string[]
  authorUsername: string
  authorCharacterName?: string
  content: string
  type: string
  isDmOnly?: boolean
  metadata?: MessageMetadataEntity
  createdAt: number
}

export interface SessionHistoryThread {
  sessionId: string
  dmId?: string
  sessionName: string
  sessionState: string
  createdAt: number
  startedAt?: number
  endedAt?: number
  messages: SessionHistoryMessage[]
}

export type SessionLogEntry = SessionHistoryMessage

export type HistoryGroupBy = 'session' | 'day'
export type HistorySortOrder = 'newest' | 'oldest'

export interface HistoryControls {
  groupBy: HistoryGroupBy
  sortOrder: HistorySortOrder
}
