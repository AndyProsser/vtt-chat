export interface LogEntry {
  id: string
  timestamp: string
  severity: string
  source: string
  message: string
  details?: unknown
}

export interface LogDetailResponse {
  log: LogEntry
}

export interface LogResponse {
  logs: LogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  sortBy: 'timestamp' | 'severity' | 'source' | 'message'
  sortDir: 'asc' | 'desc'
}

export type SortBy = 'timestamp' | 'severity' | 'source' | 'message'
export type SortDir = 'asc' | 'desc'
