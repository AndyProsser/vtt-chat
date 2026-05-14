import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemToasts } from '../../src/components/session/SystemToasts'
import { clearToasts, getToastItems } from '../../src/state/toastCenter'

describe('SystemToasts', () => {
  beforeEach(() => {
    clearToasts()
  })

  it('does not enqueue when no message is provided', () => {
    render(<SystemToasts />)
    expect(getToastItems()).toHaveLength(0)
  })

  it('enqueues info toast by default', () => {
    render(<SystemToasts message="Session paused" />)

    const [toast] = getToastItems()
    expect(toast).toBeTruthy()
    expect(toast?.variant).toBe('info')
    expect(toast?.message).toBe('Session paused')
  })

  it('passes through explicit variant', () => {
    render(<SystemToasts message="Connection failed" variant="error" />)

    const [toast] = getToastItems()
    expect(toast?.variant).toBe('error')
  })

  it('wires onDismiss callback into queued toast item', () => {
    const onDismiss = vi.fn()
    render(<SystemToasts message="Notice" onDismiss={onDismiss} />)

    const [toast] = getToastItems()
    toast?.onDismiss?.()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('reuses toast id when provided to avoid duplicate notices', () => {
    const { rerender } = render(<SystemToasts toastId="notice-1" message="Notice" />)
    rerender(<SystemToasts toastId="notice-1" message="Notice" />)

    expect(getToastItems()).toHaveLength(1)
  })
})
