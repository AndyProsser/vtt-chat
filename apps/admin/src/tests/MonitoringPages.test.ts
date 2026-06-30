import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const useMonitoringTelemetryMock = vi.fn()
const useDashboardJobsMock = vi.fn()

vi.mock('../features/monitoring/useMonitoringTelemetry', () => ({
  useMonitoringTelemetry: (...args: unknown[]) => useMonitoringTelemetryMock(...args),
}))

vi.mock('../features/monitoring/MonitoringAreaChart', () => ({
  MonitoringAreaChart: ({ title }: { title: string }) => React.createElement('div', null, title),
}))

vi.mock('../features/dashboard/useDashboardJobs', () => ({
  useDashboardJobs: (...args: unknown[]) => useDashboardJobsMock(...args),
}))

import Dashboard from '../pages/Dashboard'

const BASE_SNAPSHOT = {
  dashboard: {
    activeUsers: 42,
    activeRooms: 8,
    recentErrors: 1,
    systemLoadPercent: 35,
    messageThroughputPerMinute: 118,
    storageUsagePercent: 57,
    totalUsers: 120,
    suspendedUsers: 3,
    activeCampaigns: 12,
    recentModerationActions: 4,
    clientTelemetryEventsLastHour: 250,
    topClientEvents: [
      { event: 'CHAT:MESSAGE_SENT', count: 140 },
      { event: 'ROOM:JOINED', count: 110 },
    ],
  },
  status: {
    cards: {
      cpuPercent: 37,
      memoryPercent: 62,
      diskPercent: 71,
      networkLatencyMs: 45,
      livekitStatus: 'Online',
      databaseStatus: 'Online',
    },
    charts: {
      cpuLoad24h: [
        { x: 1, y: 30 },
        { x: 2, y: 42 },
      ],
      messageThroughput24h: [
        { x: 1, y: 100 },
        { x: 2, y: 124 },
      ],
    },
    uptimeSec: 3600,
    clientTelemetryEventsLastHour: 250,
  },
  loading: false,
  error: null,
}

const BASE_JOBS = {
  queues: [],
  loading: false,
  error: null,
  retryBusy: null,
  reload: vi.fn(),
  retryFailed: vi.fn(),
}

describe('Dashboard page', () => {
  let container: HTMLDivElement
  let root: Root

  const renderDashboard = async () => {
    await act(async () => {
      root.render(React.createElement(Dashboard, { onNavigateToJobs: vi.fn() }))
    })
  }

  beforeEach(() => {
    useMonitoringTelemetryMock.mockReset()
    useMonitoringTelemetryMock.mockReturnValue(BASE_SNAPSHOT)
    useDashboardJobsMock.mockReset()
    useDashboardJobsMock.mockReturnValue(BASE_JOBS)

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders dashboard with active sessions and connected users', async () => {
    await renderDashboard()

    expect(container.textContent).toContain('Dashboard')
    expect(container.textContent).toContain('Active Sessions')
    expect(container.textContent).toContain('Connected Users')
    expect(container.textContent).toContain('42')
  })

  it('renders system status from telemetry', async () => {
    await renderDashboard()

    expect(container.textContent).toContain('Healthy')
  })

  it('renders job queues zero-state when no queues', async () => {
    await renderDashboard()

    expect(container.textContent).toContain('Job Queues')
    expect(container.textContent).toContain('the roads are safe')
  })

  it('renders chart section', async () => {
    await renderDashboard()

    expect(container.textContent).toContain('Activity')
    expect(container.textContent).toContain('Message Throughput')
    expect(container.textContent).toContain('CPU Load')
  })
})
