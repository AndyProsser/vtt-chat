import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GuestUpgradePrompt } from '../../components/auth/GuestUpgradePrompt'

describe('GuestUpgradePrompt', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders guest account upgrade messaging and email state', () => {
    render(
      <GuestUpgradePrompt
        email="guest@example.com"
        loading={false}
        onUpgrade={vi.fn(async () => {})}
        onDismiss={vi.fn()}
      />
    )

    expect(screen.getByText('Guest Account')).toBeTruthy()
    expect(
      screen.getByText(
        'Upgrade to a full account to unlock admin access and persistent account controls.'
      )
    ).toBeTruthy()
    expect(screen.getByDisplayValue('guest@example.com')).toBeTruthy()
  })

  it('calls onDismiss when dismissed', () => {
    const onDismiss = vi.fn()
    render(
      <GuestUpgradePrompt
        email="guest@example.com"
        loading={false}
        onUpgrade={vi.fn(async () => {})}
        onDismiss={onDismiss}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('keeps the upgrade action disabled until a password is provided', () => {
    const onUpgrade = vi.fn(async () => {})
    render(
      <GuestUpgradePrompt
        email="guest@example.com"
        loading={false}
        onUpgrade={onUpgrade}
        onDismiss={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Upgrade' })).toHaveProperty('disabled', true)
    expect(onUpgrade).not.toHaveBeenCalled()
  })

  it('submits the typed password and clears the field on success', async () => {
    const onUpgrade = vi.fn(async () => {})
    render(
      <GuestUpgradePrompt
        email="guest@example.com"
        loading={false}
        onUpgrade={onUpgrade}
        onDismiss={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'VeryStrongPass!123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }))

    await waitFor(() => {
      expect(onUpgrade).toHaveBeenCalledWith('VeryStrongPass!123')
    })
    expect((screen.getByLabelText('New Password') as HTMLInputElement).value).toBe('')
  })

  it('surfaces upgrade failures from the callback', async () => {
    render(
      <GuestUpgradePrompt
        email="guest@example.com"
        loading={false}
        onUpgrade={vi.fn(async () => {
          throw new Error('Upgrade denied')
        })}
        onDismiss={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'VeryStrongPass!123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }))

    await screen.findByText('Upgrade denied')
  })
})
