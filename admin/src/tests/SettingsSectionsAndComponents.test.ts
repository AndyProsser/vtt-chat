/**
 * Tests for Settings section components, SparklineChart, and PasswordStrengthIndicator.
 */
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'
import type { RuntimeSettings } from '../features/settings/types'

const MOCK_SETTINGS: RuntimeSettings = {
  primaryRegion: 'us-east-1',
  maintenanceMode: 'off',
  chatPipelineEnabled: true,
  audioOverridesEnabled: false,
  logRetentionDays: 30,
  telemetryRetentionDays: 7,
  telemetryMaxFileSizeMb: 10,
  telemetryMaxFiles: 5,
  diagnosticRetentionDays: 14,
  diagnosticMaxFileSizeMb: 5,
  diagnosticMaxFiles: 3,
  backupWindow: '02:00-04:00',
  updatedAt: new Date().toISOString(),
}

function makeContainer(): [HTMLDivElement, Root] {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return [container, createRoot(container)]
}

async function unmount(container: HTMLDivElement, root: Root) {
  await act(async () => {
    root.unmount()
  })
  container.remove()
}

// ──────────────────────── FeatureFlagsSection ────────────────────────

import { FeatureFlagsSection } from '../features/settings/FeatureFlagsSection'

describe('FeatureFlagsSection', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;[container, root] = makeContainer()
  })
  afterEach(() => unmount(container, root))

  it('renders chat pipeline and audio overrides toggles', async () => {
    await act(async () => {
      root.render(
        React.createElement(FeatureFlagsSection, { settings: MOCK_SETTINGS, onChange: vi.fn() })
      )
    })
    expect(container.textContent).toContain('Feature Flags')
    expect(container.querySelector('#chatFlag')).not.toBeNull()
    expect(container.querySelector('#audioFlag')).not.toBeNull()
  })

  it('reflects chatPipelineEnabled=true as "enabled"', async () => {
    await act(async () => {
      root.render(
        React.createElement(FeatureFlagsSection, {
          settings: { ...MOCK_SETTINGS, chatPipelineEnabled: true },
          onChange: vi.fn(),
        })
      )
    })
    const select = container.querySelector('#chatFlag') as HTMLSelectElement
    expect(select.value).toBe('enabled')
  })

  it('reflects chatPipelineEnabled=false as "disabled"', async () => {
    await act(async () => {
      root.render(
        React.createElement(FeatureFlagsSection, {
          settings: { ...MOCK_SETTINGS, chatPipelineEnabled: false },
          onChange: vi.fn(),
        })
      )
    })
    const select = container.querySelector('#chatFlag') as HTMLSelectElement
    expect(select.value).toBe('disabled')
  })

  it('calls onChange when chat flag is changed', async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(React.createElement(FeatureFlagsSection, { settings: MOCK_SETTINGS, onChange }))
    })
    const select = container.querySelector('#chatFlag') as HTMLSelectElement
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value'
    )!.set!
    await act(async () => {
      nativeSetter.call(select, 'disabled')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith({ chatPipelineEnabled: false })
  })
})

// ──────────────────────── StorageSection ────────────────────────

import { StorageSection } from '../features/settings/StorageSection'

describe('StorageSection', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;[container, root] = makeContainer()
  })
  afterEach(() => unmount(container, root))

  it('renders log retention and backup window inputs', async () => {
    await act(async () => {
      root.render(
        React.createElement(StorageSection, { settings: MOCK_SETTINGS, onChange: vi.fn() })
      )
    })
    expect(container.textContent).toContain('Storage')
    expect(container.querySelector('#retention')).not.toBeNull()
    expect(container.querySelector('#backupWindow')).not.toBeNull()
  })

  it('reflects current logRetentionDays value', async () => {
    await act(async () => {
      root.render(
        React.createElement(StorageSection, {
          settings: { ...MOCK_SETTINGS, logRetentionDays: 60 },
          onChange: vi.fn(),
        })
      )
    })
    const input = container.querySelector('#retention') as HTMLInputElement
    expect(input.value).toBe('60')
  })

  it('calls onChange when backupWindow is changed', async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(React.createElement(StorageSection, { settings: MOCK_SETTINGS, onChange }))
    })
    const input = container.querySelector('#backupWindow') as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )!.set!
    await act(async () => {
      nativeSetter.call(input, '03:00-05:00')
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith({ backupWindow: '03:00-05:00' })
  })
})

// ──────────────────────── SystemConfigSection ────────────────────────

import { SystemConfigSection } from '../features/settings/SystemConfigSection'
import { LogSinkPoliciesSection } from '../features/settings/LogSinkPoliciesSection'

describe('SystemConfigSection', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;[container, root] = makeContainer()
  })
  afterEach(() => unmount(container, root))

  it('renders region and maintenance mode selects', async () => {
    await act(async () => {
      root.render(
        React.createElement(SystemConfigSection, { settings: MOCK_SETTINGS, onChange: vi.fn() })
      )
    })
    expect(container.textContent).toContain('System Configuration')
    expect(container.querySelector('#region')).not.toBeNull()
    expect(container.querySelector('#maintenance')).not.toBeNull()
  })

  it('reflects current primaryRegion', async () => {
    await act(async () => {
      root.render(
        React.createElement(SystemConfigSection, {
          settings: { ...MOCK_SETTINGS, primaryRegion: 'eu-west-1' },
          onChange: vi.fn(),
        })
      )
    })
    const select = container.querySelector('#region') as HTMLSelectElement
    expect(select.value).toBe('eu-west-1')
  })

  it('calls onChange when maintenance mode changes', async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(React.createElement(SystemConfigSection, { settings: MOCK_SETTINGS, onChange }))
    })
    const select = container.querySelector('#maintenance') as HTMLSelectElement
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      'value'
    )!.set!
    await act(async () => {
      nativeSetter.call(select, 'read-only')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith({ maintenanceMode: 'read-only' })
  })
})

describe('LogSinkPoliciesSection', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;[container, root] = makeContainer()
  })
  afterEach(() => unmount(container, root))

  it('renders all log sink policy fields', async () => {
    await act(async () => {
      root.render(
        React.createElement(LogSinkPoliciesSection, { settings: MOCK_SETTINGS, onChange: vi.fn() })
      )
    })
    expect(container.textContent).toContain('Log Sink Policies')
    expect(container.querySelector('#telemetryRetentionDays')).not.toBeNull()
    expect(container.querySelector('#telemetryMaxFileSizeMb')).not.toBeNull()
    expect(container.querySelector('#telemetryMaxFiles')).not.toBeNull()
    expect(container.querySelector('#diagnosticRetentionDays')).not.toBeNull()
    expect(container.querySelector('#diagnosticMaxFileSizeMb')).not.toBeNull()
    expect(container.querySelector('#diagnosticMaxFiles')).not.toBeNull()
  })

  it('calls onChange for numeric field updates', async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(
        React.createElement(LogSinkPoliciesSection, { settings: MOCK_SETTINGS, onChange })
      )
    })

    const setInput = async (id: string, value: string) => {
      const input = container.querySelector(id) as HTMLInputElement
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      await act(async () => {
        nativeSetter.call(input, value)
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })
    }

    await setInput('#telemetryRetentionDays', '14')
    await setInput('#telemetryMaxFileSizeMb', '64')
    await setInput('#telemetryMaxFiles', '10')
    await setInput('#diagnosticRetentionDays', '7')
    await setInput('#diagnosticMaxFileSizeMb', '32')
    await setInput('#diagnosticMaxFiles', '8')

    expect(onChange).toHaveBeenCalledWith({ telemetryRetentionDays: 14 })
    expect(onChange).toHaveBeenCalledWith({ telemetryMaxFileSizeMb: 64 })
    expect(onChange).toHaveBeenCalledWith({ telemetryMaxFiles: 10 })
    expect(onChange).toHaveBeenCalledWith({ diagnosticRetentionDays: 7 })
    expect(onChange).toHaveBeenCalledWith({ diagnosticMaxFileSizeMb: 32 })
    expect(onChange).toHaveBeenCalledWith({ diagnosticMaxFiles: 8 })
  })
})

// ──────────────────────── PasswordStrengthIndicator ────────────────────────

import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator'

describe('PasswordStrengthIndicator', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;[container, root] = makeContainer()
  })
  afterEach(() => unmount(container, root))

  it('shows help text when password is empty', async () => {
    await act(async () => {
      root.render(
        React.createElement(PasswordStrengthIndicator, {
          password: '',
          feedback: [],
          suggestions: [],
          score: 0,
          isValid: false,
        })
      )
    })
    expect(container.textContent).toContain('secure password')
  })

  it('shows strength label for non-empty password', async () => {
    await act(async () => {
      root.render(
        React.createElement(PasswordStrengthIndicator, {
          password: 'Test1234!',
          feedback: [],
          suggestions: [],
          score: 3,
          isValid: true,
        })
      )
    })
    const text = container.textContent ?? ''
    expect(['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'].some((l) => text.includes(l))).toBe(
      true
    )
  })

  it('shows feedback messages', async () => {
    await act(async () => {
      root.render(
        React.createElement(PasswordStrengthIndicator, {
          password: 'abc',
          feedback: ['Too short'],
          suggestions: ['Add numbers'],
          score: 1,
          isValid: false,
        })
      )
    })
    expect(container.textContent).toContain('Too short')
    expect(container.textContent).toContain('Add numbers')
  })
})

// ──────────────────────── SparklineChart ────────────────────────

import { SparklineChart } from '../components/SparklineChart'

describe('SparklineChart', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    ;[container, root] = makeContainer()
  })
  afterEach(() => unmount(container, root))

  it('renders svg with points', async () => {
    const points = [
      { x: 0, y: 10 },
      { x: 1, y: 20 },
      { x: 2, y: 15 },
    ]
    await act(async () => {
      root.render(React.createElement(SparklineChart, { points }))
    })
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('shows empty label when no points', async () => {
    await act(async () => {
      root.render(React.createElement(SparklineChart, { points: [], emptyLabel: 'No data' }))
    })
    expect(container.textContent).toContain('No data')
  })
})
