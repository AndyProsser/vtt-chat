/**
 * Tests for monitoring feature: useMonitoringTelemetry hook and chart components.
 * Charts use recharts (mocked) to avoid jsdom SVG issues.
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

// ─── API mock must be set up before any monitored module imports ───

const getJsonMock = vi.fn()

vi.mock('../utils/api', () => ({
  getJson: (...args: unknown[]) => getJsonMock(...args),
  requestJson: vi.fn(),
  ADMIN_SESSION_EXPIRED_EVENT: 'admin:session-expired',
  SessionExpiredError: class extends Error {},
}))

// Mock recharts to avoid SVG internals in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'rc' }, children),
  AreaChart: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'area-chart' }, children),
  BarChart: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'bar-chart' }, children),
  Area: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Cell: () => null,
}))

// Mock MUI useTheme to avoid theme context requirements
vi.mock('@mui/material', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as any),
    useTheme: () => ({
      palette: {
        primary: { main: '#4c8dff' },
        mode: 'dark',
        divider: '#2e3a4b',
        text: { secondary: '#a8b5cb' },
        background: { paper: '#171d27' },
      },
    }),
  }
})

import { useMonitoringTelemetry } from '../features/monitoring/useMonitoringTelemetry'
import { MonitoringAreaChart } from '../features/monitoring/MonitoringAreaChart'
import { TopEventsChart } from '../features/monitoring/TopEventsChart'
import type { DashboardTelemetry, StatusTelemetry } from '@/types/monitoring'

// ─── shared mock data ───

const MOCK_DASHBOARD: DashboardTelemetry = {
  activeUsers: 12,
  activeRooms: 4,
  recentErrors: 1,
  systemLoadPercent: 55,
  messageThroughputPerMinute: 230,
  storageUsagePercent: 40,
  totalUsers: 100,
  suspendedUsers: 2,
  activeCampaigns: 3,
  recentModerationActions: 0,
  clientTelemetryEventsLastHour: 500,
  topClientEvents: [{ event: 'join', count: 200 }],
}

const MOCK_STATUS: StatusTelemetry = {
  cards: {
    cpuPercent: 30,
    memoryPercent: 60,
    diskPercent: 50,
    networkLatencyMs: 12,
    livekitStatus: 'healthy',
    databaseStatus: 'connected',
  },
  charts: {
    cpuLoad24h: [{ x: 1000, y: 30 }],
    messageThroughput24h: [{ x: 1000, y: 100 }],
  },
  uptimeSec: 86400,
  clientTelemetryEventsLastHour: 500,
}

// ─── Hook harness ───

function HookHarness({
  onRender,
}: {
  onRender: (state: ReturnType<typeof useMonitoringTelemetry>) => void
}) {
  const state = useMonitoringTelemetry({ refreshMs: 999999 })
  onRender(state)
  return null
}

// ──────────────────────── useMonitoringTelemetry ────────────────────────

describe('useMonitoringTelemetry', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    getJsonMock.mockReset()
    getJsonMock.mockImplementation((path: string) => {
      if (path === '/telemetry/dashboard') return Promise.resolve(MOCK_DASHBOARD)
      if (path === '/telemetry/status') return Promise.resolve(MOCK_STATUS)
      return Promise.reject(new Error('unknown path'))
    })
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

  it('starts in loading state before data arrives', async () => {
    let capturedState: ReturnType<typeof useMonitoringTelemetry> | null = null
    getJsonMock.mockImplementation(() => new Promise(() => {})) // never resolves

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          onRender: (s) => {
            capturedState = s
          },
        })
      )
    })
    expect(capturedState!.loading).toBe(true)
    expect(capturedState!.dashboard).toBeNull()
    expect(capturedState!.status).toBeNull()
  })

  it('resolves dashboard and status data on mount', async () => {
    let capturedState: ReturnType<typeof useMonitoringTelemetry> | null = null

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          onRender: (s) => {
            capturedState = s
          },
        })
      )
    })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20))
    })

    expect(capturedState!.loading).toBe(false)
    expect(capturedState!.dashboard?.activeUsers).toBe(12)
    expect(capturedState!.status?.cards.cpuPercent).toBe(30)
    expect(capturedState!.error).toBeNull()
  })

  it('sets error state when fetch fails', async () => {
    getJsonMock.mockRejectedValue(new Error('Network error'))
    let capturedState: ReturnType<typeof useMonitoringTelemetry> | null = null

    await act(async () => {
      root.render(
        React.createElement(HookHarness, {
          onRender: (s) => {
            capturedState = s
          },
        })
      )
    })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20))
    })

    expect(capturedState!.loading).toBe(false)
    expect(capturedState!.error).toBe('Network error')
  })
})

// ──────────────────────── MonitoringAreaChart ────────────────────────

describe('MonitoringAreaChart', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it('renders the chart title', async () => {
    await act(async () => {
      root.render(
        React.createElement(MonitoringAreaChart, {
          title: 'CPU Load',
          points: [
            { x: 1000, y: 30 },
            { x: 2000, y: 50 },
          ],
          color: '#4c8dff',
        })
      )
    })
    expect(container.textContent).toContain('CPU Load')
  })

  it('shows empty placeholder when no points provided', async () => {
    await act(async () => {
      root.render(
        React.createElement(MonitoringAreaChart, {
          title: 'Throughput',
          points: [],
          color: '#00c896',
        })
      )
    })
    expect(container.textContent).toContain('No chart data')
  })
})

// ──────────────────────── TopEventsChart ────────────────────────

describe('TopEventsChart', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
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

  it('renders chart heading with events data', async () => {
    await act(async () => {
      root.render(
        React.createElement(TopEventsChart, {
          events: [
            { event: 'join', count: 100 },
            { event: 'leave', count: 50 },
          ],
        })
      )
    })
    expect(container.textContent).toContain('Top Client Telemetry Events')
  })

  it('shows empty state when no events provided', async () => {
    await act(async () => {
      root.render(React.createElement(TopEventsChart, { events: [] }))
    })
    expect(container.textContent).toContain('No client events')
  })
})
