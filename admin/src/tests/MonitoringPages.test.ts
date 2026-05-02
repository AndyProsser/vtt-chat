import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const useMonitoringTelemetryMock = vi.fn()

vi.mock('../features/monitoring/useMonitoringTelemetry', () => ({
  useMonitoringTelemetry: (...args: unknown[]) => useMonitoringTelemetryMock(...args),
}))

vi.mock('../features/monitoring/MonitoringAreaChart', () => ({
  MonitoringAreaChart: ({ title }: { title: string }) => React.createElement('div', null, title),
}))

vi.mock('../features/monitoring/TopEventsChart', () => ({
  TopEventsChart: () => React.createElement('div', null, 'Top Client Telemetry Events (1h)'),
}))

import Dashboard from '../pages/Dashboard'
import Analytics from '../pages/Analytics'
import PlatformStatus from '../pages/PlatformStatus'

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

describe('Monitoring pages', () => {
  let container: HTMLDivElement
  let root: Root

  const renderComponent = async (component: React.ReactElement) => {
    await act(async () => {
      root.render(component)
    })
  }

  beforeEach(() => {
    useMonitoringTelemetryMock.mockReset()
    useMonitoringTelemetryMock.mockReturnValue(BASE_SNAPSHOT)

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

  it('renders dashboard operational metrics', async () => {
    await renderComponent(React.createElement(Dashboard))

    expect(container.textContent).toContain('Dashboard')
    expect(container.textContent).toContain('Active Users')
    expect(container.textContent).toContain('42')
    expect(container.textContent).toContain('Moderation Actions')
  })

  it('renders analytics trends and top client event chart section', async () => {
    await renderComponent(React.createElement(Analytics))

    expect(container.textContent).toContain('Analytics')
    expect(container.textContent).toContain('CPU Trend (24h)')
    expect(container.textContent).toContain('Top Client Telemetry Events (1h)')
    expect(container.textContent).toContain('Client Events (1h):')
  })

  it('renders system health cards and uptime details', async () => {
    await renderComponent(React.createElement(PlatformStatus))

    expect(container.textContent).toContain('System Health')
    expect(container.textContent).toContain('CPU')
    expect(container.textContent).toContain('Memory')
    expect(container.textContent).toContain('Process Uptime')
    expect(container.textContent).toContain('60 minutes')
  })
})
