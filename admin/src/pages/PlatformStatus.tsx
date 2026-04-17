import { useEffect, useState } from 'react'
import { getJson } from '../utils/api'

interface StatusTelemetry {
  cards: {
    cpuPercent: number
    memoryPercent: number
    diskPercent: number
    networkLatencyMs: number
    livekitStatus: string
    databaseStatus: string
  }
  charts: {
    cpuLoad24h: Array<{ x: number; y: number }>
    messageThroughput24h: Array<{ x: number; y: number }>
  }
  uptimeSec: number
}

function statusLabelFromPercent(value: number): string {
  if (value >= 85) return 'Critical'
  if (value >= 70) return 'Degraded'
  return 'Healthy'
}

export default function PlatformStatus() {
  const [data, setData] = useState<StatusTelemetry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getJson<StatusTelemetry>('/telemetry/status', controller.signal)
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load status telemetry')
      } finally {
        setLoading(false)
      }
    }

    void load()
    const interval = setInterval(() => void load(), 20_000)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [])

  return (
    <section className="admin-page">
      <h2 className="admin-page-title">System Health</h2>
      <p className="admin-page-subtitle">Runtime metrics and dependency status.</p>

      {loading && <p className="admin-inline-status">Loading status telemetry...</p>}
      {error && <p className="admin-inline-error">{error}</p>}

      <div className="admin-card-grid three-col">
        <article className="admin-card metric">
          <h3>CPU</h3>
          <p className="metric-value">
            {typeof data?.cards.cpuPercent === 'number' ? `${data.cards.cpuPercent}%` : '--'}
          </p>
          <small>
            Status:{' '}
            {typeof data?.cards.cpuPercent === 'number'
              ? statusLabelFromPercent(data.cards.cpuPercent)
              : '--'}
          </small>
        </article>
        <article className="admin-card metric">
          <h3>Memory</h3>
          <p className="metric-value">
            {typeof data?.cards.memoryPercent === 'number' ? `${data.cards.memoryPercent}%` : '--'}
          </p>
          <small>
            Status:{' '}
            {typeof data?.cards.memoryPercent === 'number'
              ? statusLabelFromPercent(data.cards.memoryPercent)
              : '--'}
          </small>
        </article>
        <article className="admin-card metric">
          <h3>Disk</h3>
          <p className="metric-value">
            {typeof data?.cards.diskPercent === 'number' ? `${data.cards.diskPercent}%` : '--'}
          </p>
          <small>
            Status:{' '}
            {typeof data?.cards.diskPercent === 'number'
              ? statusLabelFromPercent(data.cards.diskPercent)
              : '--'}
          </small>
        </article>
        <article className="admin-card metric">
          <h3>Network</h3>
          <p className="metric-value">
            {typeof data?.cards.networkLatencyMs === 'number'
              ? `${data.cards.networkLatencyMs}ms`
              : '--'}
          </p>
          <small>Status: Healthy</small>
        </article>
        <article className="admin-card metric">
          <h3>LiveKit</h3>
          <p className="metric-value">{data?.cards.livekitStatus ?? '--'}</p>
          <small>Status: Healthy</small>
        </article>
        <article className="admin-card metric">
          <h3>Database</h3>
          <p className="metric-value">{data?.cards.databaseStatus ?? '--'}</p>
          <small>Status: Healthy</small>
        </article>
      </div>

      <div className="admin-card-grid two-col">
        <article className="admin-card">
          <h3>CPU Load (24h)</h3>
          <p className="chart-placeholder">
            {data?.charts.cpuLoad24h?.length
              ? `Latest: ${data.charts.cpuLoad24h[data.charts.cpuLoad24h.length - 1].y}%`
              : 'No data'}
          </p>
        </article>
        <article className="admin-card">
          <h3>Message Throughput (24h)</h3>
          <p className="chart-placeholder">
            {data?.charts.messageThroughput24h?.length
              ? `Latest: ${data.charts.messageThroughput24h[data.charts.messageThroughput24h.length - 1].y}/min`
              : 'No data'}
          </p>
        </article>
      </div>

      <section className="admin-card">
        <h3>Process Uptime</h3>
        <p>
          {typeof data?.uptimeSec === 'number'
            ? `${Math.floor(data.uptimeSec / 60)} minutes`
            : '--'}
        </p>
      </section>
    </section>
  )
}
