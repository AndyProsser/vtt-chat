export type LogSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
export type LogSortBy = 'timestamp' | 'severity' | 'source' | 'message'
export type LogSortDir = 'asc' | 'desc'
export type LogTimeRange = '1h' | '24h' | '7d'

export interface AdminLogRow {
  id: string
  timestamp: string
  severity: LogSeverity
  source: string
  message: string
  details?: Record<string, unknown> | null
}

export interface LogsListResponse {
  logs: AdminLogRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  sortBy: LogSortBy
  sortDir: LogSortDir
}

export interface LogDetailResponse {
  log: AdminLogRow
}
