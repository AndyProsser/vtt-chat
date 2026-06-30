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
    expect(fetchMock).toHaveBeenCalledWith('http://localhost/api/admin/setup-status')
  })

  it('shows setup wizard when setup is required', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(true, 200, { setupRequired: true }))

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()

    expect(container.textContent).toContain('SetupPage')
    expect(container.textContent).not.toContain('LoginPage')
  })

  it('shows invite onboarding when invite token is in URL', async () => {
    window.history.replaceState({}, document.title, '/?invite=test-invite-token')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(true, 200, { setupRequired: false }))

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()

    expect(container.textContent).toContain('InviteOnboardingPage')
    expect(container.textContent).not.toContain('LoginPage')
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
      'http://localhost/api/admin/me',
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

  it('switches to users page when nav item is clicked while authenticated', async () => {
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
      .mockResolvedValueOnce(createFetchResponse(true, 200, { admin: { id: 'admin-1' } }))

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()
    await flushEffects()

    const usersNavButton = Array.from(
      container.querySelectorAll('div[role="button"], button')
    ).find((node) => node.textContent?.includes('Users')) as HTMLElement

    await act(async () => {
      usersNavButton.click()
    })

    expect(container.textContent).toContain('UsersPage')
  })

  it('handles session expired event by logging out and showing error', async () => {
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
      .mockResolvedValueOnce(createFetchResponse(true, 200, { admin: { id: 'admin-1' } }))

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()
    await flushEffects()

    await act(async () => {
      window.dispatchEvent(new Event('vtt-admin:session-expired'))
    })

    expect(container.textContent).toContain('LoginPage')
    expect(container.textContent).toContain('Admin session expired. Please sign in again.')
  })

  it('shows handoff exchange error when launch token exchange fails', async () => {
    window.history.replaceState({}, document.title, '/?handoff=bad-token')

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createFetchResponse(true, 200, { setupRequired: false }))
      .mockResolvedValueOnce(
        createFetchResponse(false, 400, {
          error: 'Invalid handoff token',
        })
      )

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()
    await flushEffects()

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost/api/admin/auth/handoff/exchange',
      expect.objectContaining({ method: 'POST' })
    )
    expect(container.textContent).toContain('Invalid handoff token')
    expect(container.textContent).toContain('LoginPage')
  })

  it('shows missing token error when Open App is clicked without token', async () => {
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
      .mockResolvedValueOnce(createFetchResponse(true, 200, { admin: { id: 'admin-1' } }))

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()
    await flushEffects()

    await act(async () => {
      useAuthStore.setState({ token: null, isAuthenticated: true })
    })
    await flushEffects()

    const openAppButton = container.querySelector(
      'button[aria-label="Open frontend"]'
    ) as HTMLButtonElement

    await act(async () => {
      openAppButton.click()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(openAppButton.textContent).toContain('Open App')
  })

  it('shows missing handoff token error when Open App response is incomplete', async () => {
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
      .mockResolvedValueOnce(createFetchResponse(true, 200, { admin: { id: 'admin-1' } }))
      .mockResolvedValueOnce(createFetchResponse(true, 200, {}))

    vi.stubGlobal('fetch', fetchMock)

    await renderApp()
    await flushEffects()
    await flushEffects()

    const openAppButton = container.querySelector(
      'button[aria-label="Open frontend"]'
    ) as HTMLButtonElement

    await act(async () => {
      openAppButton.click()
    })

    await flushEffects()

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost/api/admin/handoff/app',
      expect.objectContaining({ method: 'POST' })
    )
    expect(openAppButton.textContent).toContain('Open App')
  })
})
