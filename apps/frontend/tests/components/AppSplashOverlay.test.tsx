import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppSplashOverlay } from '@/components/overlays/AppSplashOverlay'

describe('AppSplashOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('fades out and dismisses after session surface is ready', () => {
    const { rerender } = render(
      <AppSplashOverlay active={true} sessionSurfaceReady={false} resetKey="user-1" />
    )

    let overlay = document.body.querySelector('.app-splash-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay?.className).toContain('is-visible')

    rerender(<AppSplashOverlay active={true} sessionSurfaceReady={true} resetKey="user-1" />)

    overlay = document.body.querySelector('.app-splash-overlay')
    expect(overlay).toBeTruthy()
    expect(overlay?.className).toContain('is-fading-out')

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(document.body.querySelector('.app-splash-overlay')).toBeNull()
  })

  it('cleans interval and pending timeout on unmount', () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    const { unmount } = render(
      <AppSplashOverlay active={true} sessionSurfaceReady={false} resetKey="user-2" />
    )

    act(() => {
      vi.advanceTimersByTime(2500)
    })

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('does not emit render-loop warnings through readiness toggles', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const { rerender } = render(
      <AppSplashOverlay active={true} sessionSurfaceReady={false} resetKey="user-3" />
    )

    rerender(<AppSplashOverlay active={true} sessionSurfaceReady={true} resetKey="user-3" />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    rerender(<AppSplashOverlay active={false} sessionSurfaceReady={true} resetKey="user-3" />)
    rerender(<AppSplashOverlay active={true} sessionSurfaceReady={false} resetKey="user-4" />)

    act(() => {
      vi.advanceTimersByTime(2500)
    })

    const maximumDepthWarning = consoleErrorSpy.mock.calls.find(([message]) =>
      String(message).toLowerCase().includes('maximum update depth exceeded')
    )

    expect(maximumDepthWarning).toBeUndefined()
  })
})
