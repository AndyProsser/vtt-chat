import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastViewport } from '../../src/components/ui/ToastViewport'
import { clearToasts, dismissToast, showToast } from '../../src/state/toastCenter'

describe('ToastViewport', () => {
  beforeEach(() => {
    clearToasts()
    vi.useRealTimers()
  })

  it('renders queued toast messages', () => {
    render(<ToastViewport />)

    act(() => {
      showToast({ id: 'a', message: 'Saved', variant: 'success' })
    })

    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('removes toast when dismissed', async () => {
    render(<ToastViewport />)

    act(() => {
      showToast({ id: 'a', message: 'Dismiss me', variant: 'warn' })
    })

    act(() => {
      dismissToast('a')
    })

    await waitFor(() => {
      expect(screen.queryByText('Dismiss me')).toBeNull()
    })
  })

  it('auto-dismisses after configured timeout', async () => {
    render(<ToastViewport />)

    act(() => {
      showToast({ id: 'a', message: 'Timed', variant: 'info', durationMs: 1 })
    })

    await waitFor(() => {
      expect(screen.queryByText('Timed')).toBeNull()
    })
  })
})
