import { useEffect, useMemo, useState } from 'react'
import { requestJson } from '../../utils/api'

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

interface LogsListResponse {
  logs: AdminLogRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  sortBy: LogSortBy
  sortDir: LogSortDir
}

interface LogDetailResponse {
  log: AdminLogRow
}

export function useLogsPage() {
  const [timeRange, setTimeRange] = useState<LogTimeRange>('24h')
  const [severity, setSeverity] = useState<string>('all')
  const [source, setSource] = useState('all')
  const [userId, setUserId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState<LogSortBy>('timestamp')
  const [sortDir, setSortDir] = useState<LogSortDir>('desc')
  const [rows, setRows] = useState<AdminLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<AdminLogRow | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      timeRange,
      severity,
      source,
      userId,
      roomId,
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
    })

    return params.toString()
  }, [timeRange, severity, source, userId, roomId, page, pageSize, sortBy, sortDir])

  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await requestJson<LogsListResponse>(`/telemetry/logs?${queryString}`, {
          method: 'GET',
        })

        setRows(result.logs)
        setTotal(result.total)
        setTotalPages(result.totalPages)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load telemetry logs')
      } finally {
        setLoading(false)
      }
    }

    void loadLogs()
  }, [queryString])

  const toggleSort = (nextSortBy: LogSortBy) => {
    if (nextSortBy === sortBy) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(nextSortBy)
      setSortDir(nextSortBy === 'timestamp' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  const sortIndicator = (column: LogSortBy): string => {
    if (column !== sortBy) return ''
    return sortDir === 'asc' ? '↑' : '↓'
  }

  const openLogDetail = async (row: AdminLogRow) => {
    setDetailLoadingId(row.id)
    setError(null)

    try {
      const result = await requestJson<LogDetailResponse>(
        `/telemetry/logs/${encodeURIComponent(row.id)}`,
        {
          method: 'GET',
        }
      )
      setSelectedLog(result.log)
    } catch (err) {
      // Some log sources do not support durable drill-down; fallback to row-level details.
      setSelectedLog(row)
      setError(err instanceof Error ? err.message : 'Failed to load log details')
    } finally {
      setDetailLoadingId(null)
    }
  }

  return {
    timeRange,
    setTimeRange,
    severity,
    setSeverity,
    source,
    setSource,
    userId,
    setUserId,
    roomId,
    setRoomId,
    page,
    setPage,
    pageSize,
    setPageSize,
    rows,
    total,
    totalPages,
    loading,
    error,
    selectedLog,
    setSelectedLog,
    detailLoadingId,
    toggleSort,
    sortIndicator,
    openLogDetail,
  }
}
