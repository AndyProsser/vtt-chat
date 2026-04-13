import { useState, useEffect } from 'react'
import '../styles/Page.css'

interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  service: string
  message: string
  metadata?: Record<string, any>
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState<string>('all')
  const [service, setService] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchLogs()
    const interval = setInterval(fetchLogs, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [level, service])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      let url = '/admin/api/logs?limit=100'
      if (level !== 'all') url += `&level=${level}`
      if (service !== 'all') url += `&service=${service}`

      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch logs')
      const data = await response.json()
      setLogs(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading logs')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="page"><p>Loading logs...</p></div>

  const levelColor = (level: string) => {
    switch (level) {
      case 'error':
        return '#ef4444'
      case 'warn':
        return '#f97316'
      case 'info':
        return '#3b82f6'
      case 'debug':
        return '#8b5cf6'
      default:
        return '#6b7280'
    }
  }

  return (
    <div className="page">
      <h1>System Logs</h1>
      <p className="info-text">
        View real-time application logs from all services.
      </p>

      <div className="filter-bar">
        <div>
          <label htmlFor="levelFilter">Level: </label>
          <select
            id="levelFilter"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
        </div>

        <div>
          <label htmlFor="serviceFilter">Service: </label>
          <select
            id="serviceFilter"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="all">All Services</option>
            <option value="backend">Backend</option>
            <option value="livekit">LiveKit</option>
            <option value="database">Database</option>
            <option value="redis">Redis</option>
          </select>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="logs-container">
        {logs.length === 0 ? (
          <p className="empty-state">No logs found</p>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="log-entry">
              <div className="log-header">
                <span
                  className="log-level"
                  style={{ backgroundColor: levelColor(log.level) }}
                >
                  {log.level.toUpperCase()}
                </span>
                <span className="log-service">{log.service}</span>
                <span className="log-time">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <button
                  className="log-toggle"
                  onClick={() =>
                    setExpandedId(expandedId === log.id ? null : log.id)
                  }
                >
                  {expandedId === log.id ? '▼' : '▶'}
                </button>
              </div>
              <div className="log-message">{log.message}</div>
              {expandedId === log.id && log.metadata && (
                <div className="log-metadata">
                  <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button onClick={fetchLogs} className="btn btn-primary">
          Refresh
        </button>
      </div>
    </div>
  )
}
