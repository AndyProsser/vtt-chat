/**
 * SystemToasts component tests
 * Validates:
 *  - Empty state renders without message
 *  - Delegates to Toast with correct variant and message
 *  - Default variant is "info"
 *  - Dismissal wiring passes through to onDismiss
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SystemToasts } from '../../components/session/SystemToasts'

describe('SystemToasts', () => {
  it('renders empty-state text when no message is provided', () => {
    render(<SystemToasts />)
    expect(screen.getByText(/no active system notices/i)).toBeTruthy()
  })

  it('renders an info toast (polite) when given a message with default variant', () => {
    const { container } = render(<SystemToasts message="Session paused" />)
    const el = container.querySelector('[role="status"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('aria-live')).toBe('polite')
    expect(screen.getByText('Session paused')).toBeTruthy()
  })

  it('renders an error toast (assertive) when variant=error', () => {
    const { container } = render(<SystemToasts message="Connection failed" variant="error" />)
    const el = container.querySelector('[role="alert"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('aria-live')).toBe('assertive')
  })

  it('renders a warn toast (assertive) when variant=warn', () => {
    const { container } = render(<SystemToasts message="Low bandwidth" variant="warn" />)
    const el = container.querySelector('[role="alert"]')
    expect(el).toBeTruthy()
  })

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<SystemToasts message="Notice" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not render a dismiss button when onDismiss is not provided', () => {
    render(<SystemToasts message="Notice" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
