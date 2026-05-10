/**
 * ReconnectBanner component tests
 * Validates:
 *  - Hidden when wsState === 'connected' and not hydrating
 *  - Renders reconnecting banner for 'reconnecting' state
 *  - Renders reconnecting banner for 'connecting' state
 *  - Renders disconnected banner for 'disconnected' state
 *  - Renders hydrating banner when isHydrating=true (even if wsState=connected)
 *  - Correct aria attributes for screen-reader announcement
 *
 * Integration coverage: reconnect → hydration flow
 *  - Verifies that the banner transitions from "Reconnecting" to "Refreshing"
 *    and then disappears once hydration completes, reflecting the atomic
 *    domain-snapshot application sequence in SessionInit.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReconnectBanner } from '../../components/ui/ReconnectBanner'

describe('ReconnectBanner', () => {
  it('renders nothing when wsState is connected and not hydrating', () => {
    const { container } = render(<ReconnectBanner wsState="connected" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when wsState is connected and isHydrating is false', () => {
    const { container } = render(<ReconnectBanner wsState="connected" isHydrating={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a banner for wsState=reconnecting', () => {
    render(<ReconnectBanner wsState="reconnecting" />)
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner).toBeTruthy()
    expect(banner.textContent).toMatch(/reconnecting/i)
  })

  it('renders a banner for wsState=connecting', () => {
    render(<ReconnectBanner wsState="connecting" />)
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner.textContent).toMatch(/reconnecting/i)
  })

  it('renders a disconnected banner for wsState=disconnected', () => {
    render(<ReconnectBanner wsState="disconnected" />)
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner.textContent).toMatch(/connection lost/i)
  })

  it('renders a hydrating banner when isHydrating=true, even if wsState=connected', () => {
    render(<ReconnectBanner wsState="connected" isHydrating={true} />)
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner.textContent).toMatch(/refreshing session data/i)
  })

  it('has role=status and aria-live=polite for screen-reader announcement', () => {
    render(<ReconnectBanner wsState="reconnecting" />)
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.getAttribute('aria-live')).toBe('polite')
    expect(banner.getAttribute('aria-atomic')).toBe('true')
  })

  it('exposes data-ws-state attribute reflecting the current ws state', () => {
    render(<ReconnectBanner wsState="reconnecting" />)
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner.getAttribute('data-ws-state')).toBe('reconnecting')
  })

  it('exposes data-hydrating=true attribute when hydrating', () => {
    render(<ReconnectBanner wsState="connected" isHydrating={true} />)
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner.getAttribute('data-hydrating')).toBe('true')
  })

  it('renders manual retry countdown when provided', () => {
    render(<ReconnectBanner wsState="reconnecting" manualRetryCountdownSeconds={23} />)
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner.textContent).toMatch(/manual retry in 23s/i)
  })

  it('hides manual retry countdown while hydrating', () => {
    render(
      <ReconnectBanner wsState="connected" isHydrating={true} manualRetryCountdownSeconds={18} />
    )
    const banner = screen.getByTestId('reconnect-banner')
    expect(banner.textContent).not.toMatch(/manual retry in/i)
  })
})

/**
 * Reconnect → Hydration sequence integration test.
 *
 * Simulates the full banner lifecycle:
 *   1. 'reconnecting' → shows "Reconnecting" banner
 *   2. 'connected' + isHydrating=true → shows "Refreshing" banner (atomic snapshot applying)
 *   3. 'connected' + isHydrating=false → banner disappears (hydration complete)
 *
 * This validates the reconnect UX contract: users see a persistent
 * status indicator throughout the reconnect→hydration pipeline, not just
 * during the socket reconnect phase.
 */
describe('ReconnectBanner — reconnect-to-hydration lifecycle', () => {
  it('shows reconnecting → refreshing → gone sequence across re-renders', () => {
    // Phase 1: socket is reconnecting
    const { rerender, queryByTestId } = render(<ReconnectBanner wsState="reconnecting" />)
    expect(queryByTestId('reconnect-banner')?.textContent).toMatch(/reconnecting/i)

    // Phase 2: socket reconnected but store hydration in flight
    rerender(<ReconnectBanner wsState="connected" isHydrating={true} />)
    expect(queryByTestId('reconnect-banner')?.textContent).toMatch(/refreshing session data/i)

    // Phase 3: hydration complete — banner disappears
    rerender(<ReconnectBanner wsState="connected" isHydrating={false} />)
    expect(queryByTestId('reconnect-banner')).toBeNull()
  })
})
