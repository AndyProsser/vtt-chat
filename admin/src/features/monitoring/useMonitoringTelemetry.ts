import { useEffect, useState } from 'react'
import { getJson } from '../../utils/api'
import type { DashboardTelemetry, StatusTelemetry } from '@/types/monitoring'

interface UseMonitoringTelemetryOptions {
  refreshMs?: number
}

export function useMonitoringTelemetry(options: UseMonitoringTelemetryOptions = {}) {
  const { refreshMs = 20_000 } = options
  const [dashboard, setDashboard] = useState<DashboardTelemetry | null>(null)
  const [status, setStatus] = useState<StatusTelemetry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const [dashboardResult, statusResult] = await Promise.all([
          getJson<DashboardTelemetry>('/telemetry/dashboard'),
          getJson<StatusTelemetry>('/telemetry/status'),
        ])

        setDashboard(dashboardResult)
        setStatus(statusResult)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load telemetry')
      } finally {
        setLoading(false)
      }
    }

    void load()
    const interval = window.setInterval(() => {
      void load()
    }, refreshMs)

    return () => {
      window.clearInterval(interval)
    }
  }, [refreshMs])

  return {
    dashboard,
    status,
    loading,
    error,
  }
}
