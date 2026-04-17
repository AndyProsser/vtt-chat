import { useEffect, useMemo, useState } from 'react'
import { adminApiBase, getJson } from '../utils/api'

interface LogEntry {
  timestamp: string
  severity: string
  source: string
  message: string
  details?: unknown
}

interface LogResponse {
  logs: LogEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  sortBy: 'timestamp' | 'severity' | 'source' | 'message'
  sortDir: 'asc' | 'desc'
}

type SortBy = 'timestamp' | 'severity' | 'source' | 'message'
type SortDir = 'asc' | 'desc'

export default function Logs() {
  const [timeRange, setTimeRange] = useState('24h')
  const [severity, setSeverity] = useState('all')
  const [source, setSource] = useState('all')
  const [userId, setUserId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortBy, setSortBy] = useState<SortBy>('timestamp')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [rows, setRows] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      timeRange,
      severity,
      source,
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
    })
    if (userId.trim()) params.set('userId', userId.trim())
    if (roomId.trim()) params.set('roomId', roomId.trim())
    return params.toString()
  }, [timeRange, severity, source, userId, roomId, page, pageSize, sortBy, sortDir])

  useEffect(() => {
    setPage(1)
  }, [timeRange, severity, source, userId, roomId, pageSize])

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await getJson<LogResponse>(
          `/telemetry/logs?${queryString}`,
          controller.signal
        )
        setRows(response.logs)
        setTotal(response.total)
        setTotalPages(response.totalPages)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load logs')
      } finally {
        setLoading(false)
      }
    }

    void load()
    const interval = setInterval(() => void load(), 15_000)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [queryString])

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortDir('asc')
  }

  const sortIndicator = (field: SortBy) => {
    if (sortBy !== field) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  return (
    <section className="admin-page">
      <h2 className="admin-page-title">Logs & Activity</h2>
      <p className="admin-page-subtitle">Filter and inspect system events.</p>

      {loading && <p className="admin-inline-status">Loading logs...</p>}
      {error && <p className="admin-inline-error">{error}</p>}

      <div className="admin-toolbar-row wrap">
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          aria-label="Time range"
        >
          <option value="1h">Last hour</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
        </select>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          aria-label="Severity"
        >
          <option value="all">All severities</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
          <option value="all">All sources</option>
          <option value="api">API</option>
          <option value="livekit">LiveKit</option>
          <option value="db">DB</option>
          <option value="frontend">Frontend</option>
        </select>
        <input
          type="text"
          placeholder="User ID"
          aria-label="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <input
          type="text"
          placeholder="Room ID"
          aria-label="Room ID"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />
        <select
          value={String(pageSize)}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          <option value="10">10 / page</option>
          <option value="25">25 / page</option>
          <option value="50">50 / page</option>
          <option value="100">100 / page</option>
        </select>
      </div>

      <p className="admin-page-subtitle">
        Showing {rows.length} of {total} entries (page {page}/{totalPages}) from {adminApiBase()}
        /telemetry/logs
      </p>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <button className="table-sort-btn" onClick={() => toggleSort('timestamp')}>
                  Timestamp{sortIndicator('timestamp')}
                </button>
              </th>
              <th>
                <button className="table-sort-btn" onClick={() => toggleSort('severity')}>
                  Severity{sortIndicator('severity')}
                </button>
              </th>
              <th>
                <button className="table-sort-btn" onClick={() => toggleSort('source')}>
                  Source{sortIndicator('source')}
                </button>
              </th>
              <th>
                <button className="table-sort-btn" onClick={() => toggleSort('message')}>
                  Message{sortIndicator('message')}
                </button>
              </th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>No log entries match the current filter.</td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.timestamp}-${idx}`}>
                  <td>{new Date(row.timestamp).toLocaleString()}</td>
                  <td>{row.severity}</td>
                  <td>{row.source}</td>
                  <td>{row.message}</td>
                  <td>
                    <button
                      className="admin-btn admin-btn-ghost"
                      onClick={() => window.alert(JSON.stringify(row.details ?? {}, null, 2))}
                    >
                      Expand
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <button
          className="admin-btn admin-btn-ghost"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="admin-btn admin-btn-ghost"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        >
          Next
        </button>
      </div>
    </section>
  )
}
