import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const requestJsonMock = vi.fn()

vi.mock('../utils/api', () => ({
  requestJson: (...args: unknown[]) => requestJsonMock(...args),
}))

import Settings from '../pages/Settings'

const BASE_SETTINGS = {
  primaryRegion: 'us-east-1',
  maintenanceMode: 'off',
  chatPipelineEnabled: true,
  audioOverridesEnabled: false,
  logRetentionDays: 30,
  telemetryRetentionDays: 90,
  telemetryMaxFileSizeMb: 50,
  telemetryMaxFiles: 10,
  diagnosticRetentionDays: 14,
  diagnosticMaxFileSizeMb: 20,
  diagnosticMaxFiles: 5,
  backupWindow: '02:00-04:00',
  updatedAt: new Date().toISOString(),
}

describe('Settings page interactions', () => {
  let container: HTMLDivElement
  let root: Root

  const renderComponent = async () => {
    await act(async () => {
      root.render(React.createElement(Settings))
    })
  }

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    requestJsonMock.mockReset()
    requestJsonMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/settings' && init?.method === 'GET') {
        return Promise.resolve({ settings: BASE_SETTINGS })
      }
      if (path === '/settings' && init?.method === 'PUT') {
        return Promise.resolve({
          message: 'Settings saved successfully',
          settings: { ...BASE_SETTINGS, primaryRegion: 'eu-west-1' },
        })
      }
      if (path === '/settings/backup' && init?.method === 'POST') {
        return Promise.resolve({
          message: 'Backup queued',
          queuedAt: new Date('2026-01-01T03:00:00Z').toISOString(),
        })
      }
      if (path === '/settings/backup/export' && init?.method === 'GET') {
        return Promise.resolve({
          message: 'Operations export created successfully',
          artifactId: 'ops-artifact-1',
          bundle: {
            version: 1,
            exportedAt: new Date('2026-01-01T03:00:00Z').toISOString(),
            settings: BASE_SETTINGS,
            telemetry: [],
            diagnostics: [],
            auditLog: [],
          },
        })
      }
      return Promise.resolve({})
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

  it('loads settings on mount and renders field values', async () => {
    await renderComponent()
    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith('/settings', { method: 'GET' })
    expect(container.textContent).toContain('System Configuration')
    expect(container.textContent).toContain('Feature Flags')
    expect(container.textContent).toContain('Storage')
    expect(container.textContent).toContain('Log Sink Policies')

    const regionSelect = container.querySelector<HTMLSelectElement>('#region')
    expect(regionSelect?.value).toBe('us-east-1')

    const maintenanceSelect = container.querySelector<HTMLSelectElement>('#maintenance')
    expect(maintenanceSelect?.value).toBe('off')
  })

  it('shows loading indicator while fetching settings', async () => {
    let resolve!: (value: unknown) => void
    requestJsonMock.mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res
        })
    )

    await renderComponent()

    expect(container.textContent).toContain('Loading settings...')

    await act(async () => {
      resolve({ settings: BASE_SETTINGS })
    })
    await flush()

    expect(container.textContent).not.toContain('Loading settings...')
  })

  it('renders error when settings load fails', async () => {
    requestJsonMock.mockImplementation(() => Promise.reject(new Error('Network error')))

    await renderComponent()
    await flush()

    expect(container.textContent).toContain('Network error')
  })

  it('saves settings and shows status message on success', async () => {
    await renderComponent()
    await flush()

    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save Changes'
    ) as HTMLButtonElement

    await act(async () => {
      saveButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith(
      '/settings',
      expect.objectContaining({ method: 'PUT' })
    )
    expect(container.textContent).toContain('Settings saved successfully')
  })

  it('shows error when save fails', async () => {
    requestJsonMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/settings' && init?.method === 'GET') {
        return Promise.resolve({ settings: BASE_SETTINGS })
      }
      if (path === '/settings' && init?.method === 'PUT') {
        return Promise.reject(new Error('Save failed'))
      }
      return Promise.resolve({})
    })

    await renderComponent()
    await flush()

    const saveButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Save Changes'
    ) as HTMLButtonElement

    await act(async () => {
      saveButton.click()
    })

    await flush()

    expect(container.textContent).toContain('Save failed')
  })

  it('triggers backup and shows queued confirmation', async () => {
    await renderComponent()
    await flush()

    const backupButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Backup Now'
    ) as HTMLButtonElement

    await act(async () => {
      backupButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith('/settings/backup', { method: 'POST' })
    expect(container.textContent).toContain('Backup queued')
  })

  it('shows error when backup trigger fails', async () => {
    requestJsonMock.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/settings' && init?.method === 'GET') {
        return Promise.resolve({ settings: BASE_SETTINGS })
      }
      if (path === '/settings/backup') {
        return Promise.reject(new Error('Backup service unavailable'))
      }
      return Promise.resolve({})
    })

    await renderComponent()
    await flush()

    const backupButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Backup Now'
    ) as HTMLButtonElement

    await act(async () => {
      backupButton.click()
    })

    await flush()

    expect(container.textContent).toContain('Backup service unavailable')
  })

  it('exports operational bundle and renders the payload', async () => {
    await renderComponent()
    await flush()

    const exportButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Export Ops Bundle'
    ) as HTMLButtonElement

    await act(async () => {
      exportButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith('/settings/backup/export', { method: 'GET' })

    const textarea = container.querySelector(
      'textarea[aria-label="Operations export bundle"]'
    ) as HTMLTextAreaElement

    expect(textarea.value).toContain('telemetry')
  })
})
