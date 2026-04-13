import { useState, useEffect } from 'react'
import '../styles/Page.css'

interface ServiceStatus {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  uptime: number
  lastCheck: string
}

export default function PlatformStatus() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await fetch('/admin/api/status')
      if (!response.ok) throw new Error('Failed to fetch status')
      const data = await response.json()
      setServices(data.services)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading status')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="page"><p>Loading platform status...</p></div>

  const statusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return '#4ade80'
      case 'degraded':
        return '#fbbf24'
      case 'down':
        return '#ef4444'
      default:
        return '#6b7280'
    }
  }

  return (
    <div className="page">
      <h1>Platform Status</h1>
      <p className="info-text">
        Real-time status of all platform services. Last updated: {new Date().toLocaleTimeString()}
      </p>

      {error && <div className="error">{error}</div>}

      <div className="status-grid">
        {services.map((service) => (
          <div key={service.name} className="status-card">
            <div className="status-header">
              <h3>{service.name}</h3>
              <span
                className="status-indicator"
                style={{ backgroundColor: statusColor(service.status) }}
              >
                {service.status}
              </span>
            </div>
            <div className="status-details">
              <div>
                <strong>Uptime:</strong> {(service.uptime * 100).toFixed(2)}%
              </div>
              <div>
                <strong>Last Check:</strong> {new Date(service.lastCheck).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button onClick={fetchStatus} className="btn btn-primary">
          Refresh Now
        </button>
      </div>
    </div>
  )
}
