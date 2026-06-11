/**
 * Toast component tests
 * Validates:
 *  - Correct ARIA role/live region per variant (persona-safe message exposure)
 *  - Dismiss button wiring
 *  - data-variant attribute for CSS class targeting
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Toast } from '../../src/components/ui/Toast'

describe('Toast', () => {
  it('renders the provided message string', () => {
    render(<Toast variant="info" message="Session updated" />)
    expect(screen.getByText('Session updated')).toBeTruthy()
  })

  it('uses role=status and aria-live=polite for info variant', () => {
    const { container } = render(<Toast variant="info" message="Info toast" />)
    const el = container.querySelector('[role="status"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('aria-live')).toBe('polite')
  })

  it('uses role=status and aria-live=polite for success variant', () => {
    const { container } = render(<Toast variant="success" message="Done" />)
    const el = container.querySelector('[role="status"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('aria-live')).toBe('polite')
  })

  it('uses role=alert and aria-live=assertive for error variant', () => {
    const { container } = render(<Toast variant="error" message="Something went wrong" />)
    const el = container.querySelector('[role="alert"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('aria-live')).toBe('assertive')
  })

  it('uses role=alert and aria-live=assertive for warn variant', () => {
    const { container } = render(<Toast variant="warn" message="Warning" />)
    const el = container.querySelector('[role="alert"]')
    expect(el).toBeTruthy()
    expect(el?.getAttribute('aria-live')).toBe('assertive')
  })

  it('sets data-variant attribute matching the variant prop', () => {
    const { container } = render(<Toast variant="error" message="Err" />)
    const el = container.querySelector('[data-variant="error"]')
    expect(el).toBeTruthy()
  })

  it('renders dismiss button when onDismiss is provided', () => {
    render(<Toast variant="info" message="Msg" onDismiss={() => {}} />)
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeTruthy()
  })

  it('does not render dismiss button when onDismiss is omitted', () => {
    render(<Toast variant="info" message="Msg" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('calls onDismiss when dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<Toast variant="warn" message="Dismiss me" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders only the exact message string — no leaking of internal error details', () => {
    const safeMessage = 'Invalid credentials'
    render(<Toast variant="error" message={safeMessage} />)
    // Only the safe message should appear; no stack traces etc.
    expect(screen.getByText(safeMessage)).toBeTruthy()
    expect(screen.queryByText(/Error:/)).toBeNull()
  })
})
