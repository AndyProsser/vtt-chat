import { useState, useEffect } from 'react'
import '../styles/Page.css'

interface Analytics {
  totalSessions: number
  totalMinutes: number
  averageSessionLength: number
  peakUsersOnline: number
  messagesTotal: number
  notesTotal: number
}

export default function Analytics() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState('7d')

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/admin/api/analytics?range=${timeRange}`)
      if (!response.ok) throw new Error('Failed to fetch analytics')
      const data = await response.json()
      setAnalytics(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading analytics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="page"><p>Loading analytics...</p></div>
  if (error) return <div className="page error">{error}</div>
  if (!analytics) return <div className="page empty-state">No analytics available</div>

  return (
    <div className="page">
      <h1>Platform Analytics</h1>

      <div style={{ marginBottom: '2rem' }}>
        <label htmlFor="timeRange">Time Range: </label>
        <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="all">All Time</option>
        </select>
      </div>

      <div className="analytics-grid">
        <div className="metric-card">
          <h3>Total Sessions</h3>
          <p className="metric-value">{analytics.totalSessions}</p>
          <small>Complete voice/chat sessions</small>
        </div>

        <div className="metric-card">
          <h3>Total Session Time</h3>
          <p className="metric-value">
            {Math.floor(analytics.totalMinutes / 60)}h {analytics.totalMinutes % 60}m
          </p>
          <small>Combined duration</small>
        </div>

        <div className="metric-card">
          <h3>Average Session Length</h3>
          <p className="metric-value">{analytics.averageSessionLength}m</p>
          <small>Minutes per session</small>
        </div>

        <div className="metric-card">
          <h3>Peak Concurrent Users</h3>
          <p className="metric-value">{analytics.peakUsersOnline}</p>
          <small>Maximum simultaneous</small>
        </div>

        <div className="metric-card">
          <h3>Total Messages</h3>
          <p className="metric-value">{analytics.messagesTotal}</p>
          <small>Chat messages</small>
        </div>

        <div className="metric-card">
          <h3>Total Notes Created</h3>
          <p className="metric-value">{analytics.notesTotal}</p>
          <small>Campaign notes</small>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button onClick={fetchAnalytics} className="btn btn-primary">
          Refresh
        </button>
      </div>
    </div>
  )
}
