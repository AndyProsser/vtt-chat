import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, Root } from 'react-dom/client'

vi.mock('../pages/Dashboard', () => ({
  default: () => React.createElement('div', null, 'DashboardPage'),
}))

vi.mock('../pages/UserManagement', () => ({
  default: () => React.createElement('div', null, 'UsersPage'),
}))

vi.mock('../pages/CampaignManagement', () => ({
  default: () => React.createElement('div', null, 'CampaignsPage'),
}))

vi.mock('../pages/PlatformStatus', () => ({
  default: () => React.createElement('div', null, 'StatusPage'),
}))

vi.mock('../pages/Logs', () => ({
  default: () => React.createElement('div', null, 'LogsPage'),
}))

vi.mock('../pages/Settings', () => ({
  default: () => React.createElement('div', null, 'SettingsPage'),
}))

vi.mock('../pages/Setup', () => ({
  default: () => React.createElement('div', null, 'SetupPage'),
}))

vi.mock('../pages/Login', () => ({
  default: () => React.createElement('div', null, 'LoginPage'),
}))

vi.mock('../pages/InviteOnboarding', () => ({
  default: () => React.createElement('div', null, 'InviteOnboardingPage'),
}))

import App from '../App'
import { useAuthStore } from '../store'

function createFetchResponse(ok: boolean, status: number, body: unknown) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

describe('admin app guard behavior', () => {
  let container: HTMLDivElement
  let root: Root

  const renderApp = async () => {
    await act(async () => {
      root.render(React.createElement(App))
    })
  }

  const flushEffects = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.unstubAllGlobals()

    useAuthStore.setState({
      token: null,
      admin: null,
      isAuthenticated: false,
      loading: false,
      error: null,
    })

    window.history.replaceState({}, document.title, '/')

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

  it('shows login when setup is not required and user is not authenticated', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(true, 200, { setupRequired: false }))

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()

    expect(container.textContent).toContain('LoginPage')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/admin/setup-status')
  })

  it('renders dashboard when authenticated and session validation succeeds', async () => {
    sessionStorage.setItem('admin-token', 'valid-admin-token')
    useAuthStore.setState({
      token: 'valid-admin-token',
      admin: { id: 'admin-1', username: 'admin', email: 'admin@example.com' },
      isAuthenticated: true,
      loading: false,
      error: null,
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(true, 200, { setupRequired: false }))
      .mockResolvedValueOnce(
        createFetchResponse(true, 200, {
          admin: {
            id: 'admin-1',
            username: 'admin',
            email: 'admin@example.com',
            adminRole: 'ADMIN',
          },
        })
      )

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()
    await flushEffects()

    expect(container.textContent).toContain('DashboardPage')
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/admin/api/me',
      expect.objectContaining({
        method: 'GET',
      })
    )

    const [, requestInit] = fetchMock.mock.calls[1]
    const headers = requestInit.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer valid-admin-token')
  })

  it('logs out and returns to login when authenticated session validation is rejected', async () => {
    sessionStorage.setItem('admin-token', 'expired-admin-token')
    useAuthStore.setState({
      token: 'expired-admin-token',
      admin: { id: 'admin-1', username: 'admin', email: 'admin@example.com' },
      isAuthenticated: true,
      loading: false,
      error: null,
    })

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(true, 200, { setupRequired: false }))
      .mockResolvedValueOnce(
        createFetchResponse(false, 401, {
          error: 'Session is no longer valid',
        })
      )

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()
    await flushEffects()

    expect(container.textContent).toContain('LoginPage')
    expect(container.textContent).toContain('Admin session expired. Please sign in again.')
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
    expect(sessionStorage.getItem('admin-token')).toBeNull()
  })
})
