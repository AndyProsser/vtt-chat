import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const getJsonMock = vi.fn()

vi.mock('../utils/api', () => ({
  getJson: (...args: unknown[]) => getJsonMock(...args),
  adminApiBase: () => '/admin/api',
}))

import Logs from '../pages/Logs'

const BASE_LOGS_RESPONSE = {
  logs: [
    {
      id: 'diagnostic-log-1',
      timestamp: '2026-04-22T12:00:00.000Z',
      severity: 'INFO',
      source: 'api',
      message: 'Request completed',
      details: { requestId: 'req-1' },
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
  totalPages: 2,
  sortBy: 'timestamp',
  sortDir: 'desc',
}

describe('Logs page interactions', () => {
  let container: HTMLDivElement
  let root: Root

  const renderComponent = async () => {
    await act(async () => {
      root.render(React.createElement(Logs))
    })
  }

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    getJsonMock.mockReset()
    getJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/telemetry/logs/diagnostic-log-1')) {
        return Promise.resolve({
          log: {
            id: 'diagnostic-log-1',
            timestamp: '2026-04-22T12:00:00.000Z',
            severity: 'INFO',
            source: 'api',
            message: 'Request completed',
            details: { requestId: 'req-1', endpoint: '/api/rooms' },
          },
        })
      }

      if (path.includes('page=2')) {
        return Promise.resolve({
          ...BASE_LOGS_RESPONSE,
          logs: [
            {
              id: 'diagnostic-log-2',
              timestamp: '2026-04-22T11:00:00.000Z',
              severity: 'WARN',
              source: 'api',
              message: 'Rate limit warning',
              details: { requestId: 'req-2' },
            },
          ],
          page: 2,
        })
      }

      return Promise.resolve(BASE_LOGS_RESPONSE)
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

  it('requests logs with updated filter query values', async () => {
    await renderComponent()
    await flush()

    const sourceSelect = container.querySelector('select[aria-label="Source"]') as HTMLSelectElement

    await act(async () => {
      sourceSelect.value = 'telemetry'
      sourceSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await flush()

    expect(getJsonMock).toHaveBeenCalledWith(
      '/telemetry/logs?timeRange=24h&severity=all&source=telemetry&page=1&pageSize=25&sortBy=timestamp&sortDir=desc',
      expect.anything()
    )
  })

  it('toggles sort ordering when sort header is clicked', async () => {
    await renderComponent()
    await flush()

    const severitySortButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Severity')
    ) as HTMLButtonElement

    await act(async () => {
      severitySortButton.click()
    })
    await flush()

    expect(getJsonMock).toHaveBeenCalledWith(
      '/telemetry/logs?timeRange=24h&severity=all&source=all&page=1&pageSize=25&sortBy=severity&sortDir=asc',
      expect.anything()
    )

    await act(async () => {
      severitySortButton.click()
    })
    await flush()

    expect(getJsonMock).toHaveBeenCalledWith(
      '/telemetry/logs?timeRange=24h&severity=all&source=all&page=1&pageSize=25&sortBy=severity&sortDir=desc',
      expect.anything()
    )
  })

  it('paginates to next page and reloads log rows', async () => {
    await renderComponent()
    await flush()

    const nextButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Next'
    ) as HTMLButtonElement

    await act(async () => {
      nextButton.click()
    })

    await flush()

    expect(getJsonMock).toHaveBeenCalledWith(
      '/telemetry/logs?timeRange=24h&severity=all&source=all&page=2&pageSize=25&sortBy=timestamp&sortDir=desc',
      expect.anything()
    )
    expect(container.textContent).toContain('Rate limit warning')
  })

  it('loads drill-down details and renders expanded log information', async () => {
    await renderComponent()
    await flush()

    const expandButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Expand'
    ) as HTMLButtonElement

    await act(async () => {
      expandButton.click()
    })

    await flush()

    expect(getJsonMock).toHaveBeenCalledWith('/telemetry/logs/diagnostic-log-1')
    expect(container.textContent).toContain('Log Details')
    expect(container.textContent).toContain('Request completed')
    expect(container.textContent).toContain('endpoint')
  })
})
