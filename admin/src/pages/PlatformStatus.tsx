import { useEffect, useState } from 'react'
import { SparklineChart } from '../components/SparklineChart'
import { TelemetryMetricCard } from '../components/TelemetryMetricCard'
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
        <TelemetryMetricCard
          title="CPU"
          value={typeof data?.cards.cpuPercent === 'number' ? `${data.cards.cpuPercent}%` : '--'}
          subtitle={`Status: ${
            typeof data?.cards.cpuPercent === 'number'
              ? statusLabelFromPercent(data.cards.cpuPercent)
              : '--'
          }`}
        />
        <TelemetryMetricCard
          title="Memory"
          value={
            typeof data?.cards.memoryPercent === 'number' ? `${data.cards.memoryPercent}%` : '--'
          }
          subtitle={`Status: ${
            typeof data?.cards.memoryPercent === 'number'
              ? statusLabelFromPercent(data.cards.memoryPercent)
              : '--'
          }`}
        />
        <TelemetryMetricCard
          title="Disk"
          value={typeof data?.cards.diskPercent === 'number' ? `${data.cards.diskPercent}%` : '--'}
          subtitle={`Status: ${
            typeof data?.cards.diskPercent === 'number'
              ? statusLabelFromPercent(data.cards.diskPercent)
              : '--'
          }`}
        />
        <TelemetryMetricCard
          title="Network"
          value={
            typeof data?.cards.networkLatencyMs === 'number' ? `${data.cards.networkLatencyMs}ms` : '--'
          }
          subtitle="Status: Healthy"
        />
        <TelemetryMetricCard
          title="LiveKit"
          value={data?.cards.livekitStatus ?? '--'}
          subtitle="Status: Healthy"
        />
        <TelemetryMetricCard
          title="Database"
          value={data?.cards.databaseStatus ?? '--'}
          subtitle="Status: Healthy"
        />
      </div>

      <div className="admin-card-grid two-col">
        <article className="admin-card">
          <h3>CPU Load (24h)</h3>
          <SparklineChart
            points={data?.charts.cpuLoad24h || []}
            colorClassName="sparkline-chart-line-cpu"
            valueSuffix="%"
          />
        </article>
        <article className="admin-card">
          <h3>Message Throughput (24h)</h3>
          <SparklineChart
            points={data?.charts.messageThroughput24h || []}
            colorClassName="sparkline-chart-line-throughput"
            valueSuffix="/min"
          />
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
