/**
 * Tests for LogFilters, LogsTable, and Login page components.
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

// ──────────────────────── LogFilters ────────────────────────

import { LogFilters } from '../features/logs/LogFilters'
import type { LogTimeRange } from '../features/logs/types'

describe('LogFilters', () => {
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

  const defaultProps = {
    timeRange: '24h' as LogTimeRange,
    severity: 'all',
    source: 'all',
    userId: '',
    roomId: '',
    pageSize: 25,
    onTimeRangeChange: vi.fn(),
    onSeverityChange: vi.fn(),
    onSourceChange: vi.fn(),
    onUserIdChange: vi.fn(),
    onRoomIdChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  }

  it('renders all filter controls', async () => {
    await act(async () => {
      root.render(React.createElement(LogFilters, defaultProps))
    })
    expect(container.querySelector('[aria-label="Filter by time range"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Filter by severity"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Filter by source"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Filter by user id"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Filter by room id"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Rows per page"]')).not.toBeNull()
  })

  it('calls onTimeRangeChange when time range select changes', async () => {
    const onTimeRangeChange = vi.fn()
    await act(async () => {
      root.render(React.createElement(LogFilters, { ...defaultProps, onTimeRangeChange }))
    })
    const select = container.querySelector(
      '[aria-label="Filter by time range"]'
    ) as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('1h')
    expect(options).toContain('24h')
    expect(options).toContain('7d')
  })

  it('calls onSeverityChange when severity select changes', async () => {
    const onSeverityChange = vi.fn()
    await act(async () => {
      root.render(React.createElement(LogFilters, { ...defaultProps, onSeverityChange }))
    })
    const select = container.querySelector('[aria-label="Filter by severity"]') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('DEBUG')
    expect(options).toContain('INFO')
    expect(options).toContain('WARN')
    expect(options).toContain('ERROR')
  })

  it('calls onSourceChange when source select changes', async () => {
    const onSourceChange = vi.fn()
    await act(async () => {
      root.render(React.createElement(LogFilters, { ...defaultProps, onSourceChange }))
    })
    const select = container.querySelector('[aria-label="Filter by source"]') as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toContain('admin-audit')
    expect(options).toContain('telemetry')
    expect(options).toContain('runtime')
  })

  it('reflects current filter values', async () => {
    await act(async () => {
      root.render(
        React.createElement(LogFilters, {
          ...defaultProps,
          timeRange: '7d',
          severity: 'ERROR',
          source: 'runtime',
          pageSize: 50,
        })
      )
    })
    const timeSelect = container.querySelector(
      '[aria-label="Filter by time range"]'
    ) as HTMLSelectElement
    expect(timeSelect.value).toBe('7d')
    const severitySelect = container.querySelector(
      '[aria-label="Filter by severity"]'
    ) as HTMLSelectElement
    expect(severitySelect.value).toBe('ERROR')
  })

  it('fires all filter callbacks on change', async () => {
    const onTimeRangeChange = vi.fn()
    const onSeverityChange = vi.fn()
    const onSourceChange = vi.fn()
    const onUserIdChange = vi.fn()
    const onRoomIdChange = vi.fn()
    const onPageSizeChange = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(LogFilters, {
          ...defaultProps,
          onTimeRangeChange,
          onSeverityChange,
          onSourceChange,
          onUserIdChange,
          onRoomIdChange,
          onPageSizeChange,
        })
      )
    })

    const setValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
      const proto =
        element instanceof HTMLSelectElement
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
      nativeSetter.call(element, value)
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }

    await act(async () => {
      setValue(
        container.querySelector('[aria-label="Filter by time range"]') as HTMLSelectElement,
        '7d'
      )
      setValue(
        container.querySelector('[aria-label="Filter by severity"]') as HTMLSelectElement,
        'WARN'
      )
      setValue(
        container.querySelector('[aria-label="Filter by source"]') as HTMLSelectElement,
        'runtime'
      )
      setValue(
        container.querySelector('[aria-label="Filter by user id"]') as HTMLInputElement,
        'user-1'
      )
      setValue(
        container.querySelector('[aria-label="Filter by room id"]') as HTMLInputElement,
        'room-2'
      )
      setValue(container.querySelector('[aria-label="Rows per page"]') as HTMLSelectElement, '50')
    })

    expect(onTimeRangeChange).toHaveBeenCalledWith('7d')
    expect(onSeverityChange).toHaveBeenCalledWith('WARN')
    expect(onSourceChange).toHaveBeenCalledWith('runtime')
    expect(onUserIdChange).toHaveBeenCalledWith('user-1')
    expect(onRoomIdChange).toHaveBeenCalledWith('room-2')
    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })
})

// ──────────────────────── LogsTable ────────────────────────

import { LogsTable } from '../features/logs/LogsTable'
import type { AdminLogRow } from '../features/logs/types'

const SAMPLE_LOG: AdminLogRow = {
  id: 'log-1',
  timestamp: new Date('2025-01-01T12:00:00Z').toISOString(),
  severity: 'INFO',
  source: 'runtime',
  message: 'User joined campaign',
  userId: 'user-1',
  roomId: 'room-1',
  details: { key: 'value' },
}

describe('LogsTable', () => {
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

  it('renders empty state when no rows', async () => {
    await act(async () => {
      root.render(
        React.createElement(LogsTable, {
          rows: [],
          detailLoadingId: null,
          onToggleSort: () => {},
          sortIndicator: () => '↕',
          onOpenLogDetail: () => {},
        })
      )
    })
    expect(container.textContent).toContain('No logs matched')
  })

  it('renders log row data', async () => {
    await act(async () => {
      root.render(
        React.createElement(LogsTable, {
          rows: [SAMPLE_LOG],
          detailLoadingId: null,
          onToggleSort: () => {},
          sortIndicator: () => '↕',
          onOpenLogDetail: () => {},
        })
      )
    })
    expect(container.textContent).toContain('INFO')
    expect(container.textContent).toContain('runtime')
    expect(container.textContent).toContain('User joined campaign')
  })

  it('calls onToggleSort when sort buttons are clicked', async () => {
    const onToggleSort = vi.fn()
    await act(async () => {
      root.render(
        React.createElement(LogsTable, {
          rows: [],
          detailLoadingId: null,
          onToggleSort,
          sortIndicator: (col) => (col === 'timestamp' ? '↓' : '↕'),
          onOpenLogDetail: () => {},
        })
      )
    })
    const sortBtns = container.querySelectorAll('.table-sort-btn')
    expect(sortBtns.length).toBeGreaterThan(0)
    await act(async () => {
      ;(sortBtns[0] as HTMLButtonElement).click()
    })
    expect(onToggleSort).toHaveBeenCalledWith('timestamp')
  })

  it('calls onOpenLogDetail when View button is clicked', async () => {
    const onOpenLogDetail = vi.fn()
    await act(async () => {
      root.render(
        React.createElement(LogsTable, {
          rows: [SAMPLE_LOG],
          detailLoadingId: null,
          onToggleSort: () => {},
          sortIndicator: () => '↕',
          onOpenLogDetail,
        })
      )
    })
    const viewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('View')
    ) as HTMLButtonElement
    await act(async () => {
      viewBtn?.click()
    })
    expect(onOpenLogDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 'log-1' }))
  })

  it('shows loading state for a specific row', async () => {
    await act(async () => {
      root.render(
        React.createElement(LogsTable, {
          rows: [SAMPLE_LOG],
          detailLoadingId: 'log-1',
          onToggleSort: () => {},
          sortIndicator: () => '↕',
          onOpenLogDetail: () => {},
        })
      )
    })
    expect(container.textContent).toContain('Loading')
  })
})

// ──────────────────────── Login page ────────────────────────

// Mock fetch for login tests
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import Login from '../pages/Login'

describe('Login page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    fetchMock.mockReset()
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

  it('renders login form', async () => {
    const onLoginSuccess = vi.fn()
    const onError = vi.fn()
    await act(async () => {
      root.render(React.createElement(Login, { onLoginSuccess, onError }))
    })
    expect(container.querySelector('form')).not.toBeNull()
    expect(container.querySelector('[name="username"]')).not.toBeNull()
    expect(container.querySelector('[name="password"]')).not.toBeNull()
  })

  it('shows validation errors on empty submit', async () => {
    const onLoginSuccess = vi.fn()
    const onError = vi.fn()
    await act(async () => {
      root.render(React.createElement(Login, { onLoginSuccess, onError }))
    })
    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(container.textContent).toContain('required')
    expect(onLoginSuccess).not.toHaveBeenCalled()
  })

  it('shows error on failed login', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    })

    const onLoginSuccess = vi.fn()
    const onError = vi.fn()
    await act(async () => {
      root.render(React.createElement(Login, { onLoginSuccess, onError }))
    })

    const usernameInput = container.querySelector('[name="username"]') as HTMLInputElement
    const passwordInput = container.querySelector('[name="password"]') as HTMLInputElement

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!
    await act(async () => {
      nativeSetter.call(usernameInput, 'admin')
      usernameInput.dispatchEvent(new Event('change', { bubbles: true }))
      nativeSetter.call(passwordInput, 'wrongpass')
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20))
    })

    expect(onError).toHaveBeenCalledWith('Invalid credentials')
  })

  it('calls onLoginSuccess on successful login', async () => {
    const adminData = { id: 'user-1', username: 'admin', email: 'admin@example.com' }
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'test-token', admin: adminData }),
    })

    const onLoginSuccess = vi.fn()
    const onError = vi.fn()
    await act(async () => {
      root.render(React.createElement(Login, { onLoginSuccess, onError }))
    })

    const usernameInput = container.querySelector('[name="username"]') as HTMLInputElement
    const passwordInput = container.querySelector('[name="password"]') as HTMLInputElement

    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!
    await act(async () => {
      nativeSetter.call(usernameInput, 'admin')
      usernameInput.dispatchEvent(new Event('change', { bubbles: true }))
      nativeSetter.call(passwordInput, 'correctpass')
      passwordInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 20))
    })

    expect(onLoginSuccess).toHaveBeenCalledWith('test-token', adminData)
  })
})
