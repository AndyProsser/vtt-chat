import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

import Setup from '../pages/Setup'

const requestJsonMock = vi.fn()

vi.mock('../utils/api', () => ({
  requestJson: (...args: unknown[]) => requestJsonMock(...args),
  adminApiBase: () => '/admin/api',
}))

import InviteOnboarding from '../pages/InviteOnboarding'

function createFetchResponse(ok: boolean, body: unknown) {
  return {
    ok,
    json: async () => body,
  }
}

describe('Setup page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    vi.unstubAllGlobals()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders welcome step initially and moves to form', async () => {
    const onComplete = vi.fn()
    const onError = vi.fn()

    await act(async () => {
      root.render(React.createElement(Setup, { onComplete, onError }))
    })

    expect(container.textContent).toContain('Welcome to VTT-Chat Admin')

    const createButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Admin Account')
    ) as HTMLButtonElement

    await act(async () => {
      createButton.click()
    })

    expect(container.textContent).toContain('Create Sysadmin Account')
  })

  it('validates required fields and shows errors on submit', async () => {
    const onComplete = vi.fn()
    const onError = vi.fn()

    await act(async () => {
      root.render(React.createElement(Setup, { onComplete, onError }))
    })

    const createButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Admin Account')
    ) as HTMLButtonElement

    await act(async () => {
      createButton.click()
    })

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('Email is required')
    expect(container.textContent).toContain('Username is required')
    expect(container.textContent).toContain('Password is required')
  })

  it('submits valid form and calls onComplete after confirm step delay', async () => {
    const onComplete = vi.fn()
    const onError = vi.fn()

    const fetchMock = vi.fn().mockResolvedValueOnce(
      createFetchResponse(true, {
        token: 'setup-token',
        admin: { id: 'admin-1', username: 'sysadmin', email: 'admin@example.com' },
      })
    )

    vi.stubGlobal('fetch', fetchMock)

    await act(async () => {
      root.render(React.createElement(Setup, { onComplete, onError }))
    })

    const startButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Admin Account')
    ) as HTMLButtonElement

    await act(async () => {
      startButton.click()
    })

    const setInputValue = (selector: string, value: string) => {
      const input = container.querySelector(selector) as HTMLInputElement
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      nativeSetter.call(input, value)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    await act(async () => {
      setInputValue('#email', 'admin@example.com')
      setInputValue('#username', 'sysadmin')
      setInputValue('#password', 'StrongPassword123!')
      setInputValue('#passwordConfirm', 'StrongPassword123!')
    })

    const submitButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Admin Account')
    ) as HTMLButtonElement

    await act(async () => {
      submitButton.click()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost/api/admin/setup',
      expect.objectContaining({ method: 'POST' })
    )
    expect(container.textContent).toContain('Account Created Successfully')

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(onComplete).toHaveBeenCalledWith('setup-token', {
      id: 'admin-1',
      username: 'sysadmin',
      email: 'admin@example.com',
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('shows validation messages for invalid email, username, weak password, and mismatch', async () => {
    const onComplete = vi.fn()
    const onError = vi.fn()

    await act(async () => {
      root.render(React.createElement(Setup, { onComplete, onError }))
    })

    const startButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Admin Account')
    ) as HTMLButtonElement

    await act(async () => {
      startButton.click()
    })

    const setInputValue = (selector: string, value: string) => {
      const input = container.querySelector(selector) as HTMLInputElement
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      nativeSetter.call(input, value)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    await act(async () => {
      setInputValue('#email', 'invalid-email')
      setInputValue('#username', 'a')
      setInputValue('#password', 'weak')
      setInputValue('#passwordConfirm', 'different')
    })

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('Invalid email format')
    expect(container.textContent).toContain(
      'Username must be 3+ characters, letters/numbers/underscore/hyphen only'
    )
    expect(container.textContent).toContain('Password does not meet security requirements')
    expect(container.textContent).toContain('Passwords do not match')
  })

  it('surfaces backend setup error response', async () => {
    const onComplete = vi.fn()
    const onError = vi.fn()

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(false, { error: 'Setup API failed' }))

    vi.stubGlobal('fetch', fetchMock)

    await act(async () => {
      root.render(React.createElement(Setup, { onComplete, onError }))
    })

    const startButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create Admin Account')
    ) as HTMLButtonElement

    await act(async () => {
      startButton.click()
    })

    const setInputValue = (selector: string, value: string) => {
      const input = container.querySelector(selector) as HTMLInputElement
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      nativeSetter.call(input, value)
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    await act(async () => {
      setInputValue('#email', 'admin@example.com')
      setInputValue('#username', 'sysadmin')
      setInputValue('#password', 'StrongPassword123!')
      setInputValue('#passwordConfirm', 'StrongPassword123!')
    })

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(onError).toHaveBeenCalledWith('Setup API failed')
    expect(container.textContent).toContain('Setup API failed')
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('InviteOnboarding page', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    requestJsonMock.mockReset()
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

  it('renders invalid invite state when validation fails', async () => {
    requestJsonMock.mockRejectedValueOnce(new Error('invalid invite'))
    const onComplete = vi.fn()
    const onError = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(InviteOnboarding, { inviteToken: 'bad-token', onComplete, onError })
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(onError).toHaveBeenCalledWith('invalid invite')
    expect(container.textContent).toContain('Invite Invalid')
    expect(container.textContent).toContain('/admin/api/invites/validate')
  })

  it('renders validated invite details and disables prefilled email', async () => {
    requestJsonMock.mockResolvedValueOnce({
      valid: true,
      invitedRole: 'ADMIN',
      email: 'invited@example.com',
      expiresAt: '2026-05-01T00:00:00.000Z',
    })

    const onComplete = vi.fn()
    const onError = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(InviteOnboarding, { inviteToken: 'good-token', onComplete, onError })
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Join Admin')
    expect(container.textContent).toContain('ADMIN')
    const emailInput = container.querySelector('#invite-email') as HTMLInputElement
    expect(emailInput.value).toBe('invited@example.com')
    expect(emailInput.disabled).toBe(true)
  })

  it('redeems invite and calls onComplete', async () => {
    requestJsonMock
      .mockResolvedValueOnce({
        valid: true,
        invitedRole: 'CAMPAIGN_DM',
        email: null,
        expiresAt: '2026-05-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({
        token: 'invite-token',
        admin: { id: 'admin-2', username: 'invite-user', email: 'invite@example.com' },
      })

    const onComplete = vi.fn()
    const onError = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(InviteOnboarding, { inviteToken: 'token-123', onComplete, onError })
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    const setInputValue = (selector: string, value: string) => {
      const input = container.querySelector(selector) as HTMLInputElement
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )!.set!
      nativeSetter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }

    await act(async () => {
      setInputValue('#invite-username', 'invite-user')
      setInputValue('#invite-email', 'invite@example.com')
      setInputValue('#invite-password', 'Password123!')
      setInputValue('#invite-password-confirm', 'Password123!')
    })

    const form = container.querySelector('form') as HTMLFormElement
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(requestJsonMock).toHaveBeenNthCalledWith(
      2,
      '/invites/redeem',
      expect.objectContaining({ method: 'POST' })
    )
    expect(onComplete).toHaveBeenCalledWith('invite-token', {
      id: 'admin-2',
      username: 'invite-user',
      email: 'invite@example.com',
    })
  })

  it('does not revalidate invite on parent rerender with a new onError callback', async () => {
    requestJsonMock.mockResolvedValue({
      valid: true,
      invitedRole: 'ADMIN',
      email: 'invited@example.com',
      expiresAt: '2026-05-01T00:00:00.000Z',
    })

    const onComplete = vi.fn()

    await act(async () => {
      root.render(
        React.createElement(InviteOnboarding, {
          inviteToken: 'stable-token',
          onComplete,
          onError: vi.fn(),
        })
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      root.render(
        React.createElement(InviteOnboarding, {
          inviteToken: 'stable-token',
          onComplete,
          onError: vi.fn(),
        })
      )
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(requestJsonMock).toHaveBeenCalledTimes(1)
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/invites/validate?token=stable-token',
      expect.objectContaining({ method: 'GET' })
    )
  })
})
