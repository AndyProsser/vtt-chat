import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

const requestJsonMock = vi.fn()

vi.mock('../utils/api', () => ({
  requestJson: (...args: unknown[]) => requestJsonMock(...args),
}))

import UserManagement from '../pages/UserManagement'

const BASE_USER_LIST = {
  users: [
    {
      id: 'user-1',
      username: 'PlayerOne',
      email: 'player@example.com',
      displayName: 'Player One',
      role: 'PLAYER',
      adminRole: null,
      effectiveAdminRole: null,
      isActive: true,
      tokenInvalidBefore: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
  totalPages: 1,
}

const SUSPENDED_USER_LIST = {
  ...BASE_USER_LIST,
  users: BASE_USER_LIST.users.map((user) => ({ ...user, isActive: false })),
}

describe('UserManagement page interactions', () => {
  let container: HTMLDivElement
  let root: Root

  const renderComponent = async () => {
    await act(async () => {
      root.render(React.createElement(UserManagement))
    })
  }

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    requestJsonMock.mockReset()
    requestJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/users?')) return Promise.resolve(BASE_USER_LIST)
      if (path.startsWith('/invites'))
        return Promise.resolve({ inviteUrl: 'https://example.com/invite/abc123' })
      return Promise.resolve({ message: 'ok' })
    })

    vi.stubGlobal('prompt', vi.fn().mockReturnValue('Test reason'))

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  })

  it('loads users on mount and renders user rows', async () => {
    await renderComponent()
    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith(expect.stringContaining('/users?'), {
      method: 'GET',
    })
    expect(container.textContent).toContain('PlayerOne')
    expect(container.textContent).toContain('player@example.com')
  })

  it('shows error when user load fails', async () => {
    requestJsonMock.mockImplementation(() => Promise.reject(new Error('Network failure')))

    await renderComponent()
    await flush()

    expect(container.textContent).toContain('Network failure')
  })

  it('updates filter and sends new query to API', async () => {
    await renderComponent()
    await flush()

    const roleSelect = container.querySelector<HTMLSelectElement>('[aria-label="Filter by role"]')

    await act(async () => {
      roleSelect!.value = 'dm'
      roleSelect!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith(expect.stringContaining('role=dm'), {
      method: 'GET',
    })
  })

  it('executes suspend action and reloads user list', async () => {
    await renderComponent()
    await flush()

    const suspendButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Suspend'
    ) as HTMLButtonElement

    await act(async () => {
      suspendButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith(
      '/users/user-1/suspend',
      expect.objectContaining({ method: 'PATCH' })
    )
    // Should reload user list after action
    expect(
      requestJsonMock.mock.calls.filter(([path]) => path.startsWith('/users?')).length
    ).toBeGreaterThan(1)
  })

  it('executes restore action for suspended user', async () => {
    requestJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/users?')) return Promise.resolve(SUSPENDED_USER_LIST)
      return Promise.resolve({ message: 'ok' })
    })

    await renderComponent()
    await flush()

    const restoreButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Restore'
    ) as HTMLButtonElement

    await act(async () => {
      restoreButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith(
      '/users/user-1/restore',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('cancels moderation action when prompt is dismissed', async () => {
    vi.stubGlobal('prompt', vi.fn().mockReturnValue(null))

    await renderComponent()
    await flush()

    const callCountBefore = requestJsonMock.mock.calls.length

    const suspendButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Suspend'
    ) as HTMLButtonElement

    await act(async () => {
      suspendButton.click()
    })

    await flush()

    expect(requestJsonMock.mock.calls.length).toBe(callCountBefore)
  })

  it('generates invite link and shows invite URL', async () => {
    await renderComponent()
    await flush()

    const inviteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Generate Invite Link'
    ) as HTMLButtonElement

    await act(async () => {
      inviteButton.click()
    })

    await flush()

    expect(requestJsonMock).toHaveBeenCalledWith(
      '/invites',
      expect.objectContaining({ method: 'POST' })
    )
    expect(container.textContent).toContain('https://example.com/invite/abc123')
  })

  it('shows error when invite creation fails', async () => {
    requestJsonMock.mockImplementation((path: string) => {
      if (path.startsWith('/users?')) return Promise.resolve(BASE_USER_LIST)
      if (path.startsWith('/invites')) return Promise.reject(new Error('Invite quota exceeded'))
      return Promise.resolve({})
    })

    await renderComponent()
    await flush()

    const inviteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Generate Invite Link'
    ) as HTMLButtonElement

    await act(async () => {
      inviteButton.click()
    })

    await flush()

    expect(container.textContent).toContain('Invite quota exceeded')
  })
})
