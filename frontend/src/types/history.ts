export interface SessionLogEntry {
  id: string
  sessionId: string
  userId: string | null
  username: string
  eventType: string
  detail: string | null
  createdAt: string
}

export type HistoryGroupBy = 'day' | 'event'
export type HistorySortOrder = 'newest' | 'oldest'

export interface HistoryControls {
  groupBy: HistoryGroupBy
  sortOrder: HistorySortOrder
}
