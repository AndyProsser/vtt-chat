import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../../hooks/useToast'
import { clearToasts, getToastItems } from '../../state/toastCenter'

describe('useToast', () => {
  beforeEach(() => {
    clearToasts()
    vi.useRealTimers()
  })

  afterEach(() => {
    clearToasts()
  })

  it('returns a stable dispatcher and forwards toast input into the shared toast center', () => {
    const { result, rerender } = renderHook(() => useToast())
    const firstDispatcher = result.current

    rerender()

    expect(result.current).toBe(firstDispatcher)

    act(() => {
      result.current({
        id: 'toast-1',
        message: 'Saved successfully',
        variant: 'success',
        durationMs: 100,
      })
    })

    expect(getToastItems()).toMatchObject([
      {
        id: 'toast-1',
        message: 'Saved successfully',
        variant: 'success',
      },
    ])
  })

  it('preserves onDismiss callbacks through automatic timeout dismissal', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current({
        id: 'toast-2',
        message: 'Auto dismiss',
        durationMs: 5,
        onDismiss,
      })
    })

    expect(getToastItems()).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(5)
    })

    expect(getToastItems()).toHaveLength(0)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
