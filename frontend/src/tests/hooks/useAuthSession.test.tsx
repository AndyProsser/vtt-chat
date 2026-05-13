import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthSession } from '../../hooks/useAuthSession'

const API_URL = 'https://api.test'
const ADMIN_URL = 'https://admin.test'

function jsonResponse(body: unknown, ok: boolean = true) {
  return {
    ok,
    json: async () => body,
  }
}

describe('useAuthSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('bootstraps an existing session from storage and loads the auth profile', async () => {
    sessionStorage.setItem('authToken', 'stored-token')
    sessionStorage.setItem(
      'user',
      JSON.stringify({
        id: 'user-1',
        username: 'andy',
        role: 'PLAYER',
        authType: 'FULL',
      })
    )

    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer stored-token')
      return jsonResponse({
        adminRole: 'ADMIN',
        hasAdminAccess: true,
        isFullAccount: true,
        requiresUpgradeForAdmin: false,
        authType: 'FULL',
        email: 'andy@example.com',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthSession({ apiUrl: API_URL, adminUrl: ADMIN_URL }))

    await waitFor(() => {
      expect(result.current.auth.token).toBe('stored-token')
      expect(result.current.auth.user?.username).toBe('andy')
    })

    await waitFor(() => {
      expect(result.current.authProfile).toMatchObject({
        adminRole: 'ADMIN',
        hasAdminAccess: true,
        isFullAccount: true,
        authType: 'FULL',
        email: 'andy@example.com',
      })
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('clears invalid persisted user state instead of hydrating a broken session', async () => {
    sessionStorage.setItem('authToken', 'broken-token')
    sessionStorage.setItem('user', '{not-json')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthSession({ apiUrl: API_URL, adminUrl: ADMIN_URL }))

    await waitFor(() => {
      expect(result.current.auth.token).toBeNull()
      expect(sessionStorage.getItem('authToken')).toBeNull()
      expect(sessionStorage.getItem('user')).toBeNull()
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exchanges a handoff token on bootstrap and strips the query param afterwards', async () => {
    window.history.replaceState({}, '', '/?handoff=handoff-123')
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/api/auth/handoff/exchange') && method === 'POST') {
        return jsonResponse({
          token: 'handoff-token',
          user: {
            id: 'spectator-1',
            username: 'spectator',
            role: 'SPECTATOR',
            authType: 'GUEST',
          },
        })
      }

      if (url.includes('/api/auth/me') && method === 'GET') {
        return jsonResponse({
          adminRole: null,
          hasAdminAccess: false,
          isFullAccount: false,
          requiresUpgradeForAdmin: true,
          authType: 'GUEST',
          email: 'spectator@example.com',
        })
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthSession({ apiUrl: API_URL, adminUrl: ADMIN_URL }))

    await waitFor(() => {
      expect(result.current.auth).toMatchObject({
        token: 'handoff-token',
        user: {
          id: 'spectator-1',
          username: 'spectator',
          role: 'SPECTATOR',
          authType: 'GUEST',
        },
      })
    })

    expect(replaceStateSpy).toHaveBeenCalledWith({}, document.title, window.location.pathname)
    expect(window.location.search).toBe('')
    expect(result.current.authMessage).toBeNull()
  })

  it('surfaces handoff exchange failures without storing a session', async () => {
    window.history.replaceState({}, '', '/?handoff=denied')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ message: 'Launch denied' }, false))
    )

    const { result } = renderHook(() => useAuthSession({ apiUrl: API_URL, adminUrl: ADMIN_URL }))

    await waitFor(() => {
      expect(result.current.auth.token).toBeNull()
      expect(result.current.authMessage).toBe('Launch denied')
    })

    expect(sessionStorage.getItem('authToken')).toBeNull()
    expect(sessionStorage.getItem('user')).toBeNull()
  })

  it('upgrades a guest account and swaps the stored auth token and profile state', async () => {
    sessionStorage.setItem('authToken', 'guest-token')
    sessionStorage.setItem(
      'user',
      JSON.stringify({
        id: 'user-1',
        username: 'guest-player',
        role: 'PLAYER',
        authType: 'GUEST',
      })
    )

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'
      const headers = (init?.headers || {}) as Record<string, string>

      if (url.includes('/api/auth/me') && method === 'GET') {
        const fullSession = headers.Authorization === 'Bearer full-token'
        return jsonResponse({
          adminRole: null,
          hasAdminAccess: false,
          isFullAccount: fullSession,
          requiresUpgradeForAdmin: !fullSession,
          authType: fullSession ? 'FULL' : 'GUEST',
          email: 'guest@example.com',
        })
      }

      if (url.includes('/api/auth/upgrade') && method === 'POST') {
        expect(headers.Authorization).toBe('Bearer guest-token')
        expect(JSON.parse(String(init?.body || '{}'))).toMatchObject({
          password: 'VeryStrongPass!123',
        })
        return jsonResponse({ token: 'full-token' })
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthSession({ apiUrl: API_URL, adminUrl: ADMIN_URL }))

    await waitFor(() => {
      expect(result.current.authProfile?.authType).toBe('GUEST')
    })

    await act(async () => {
      await result.current.handleUpgradeAccount('VeryStrongPass!123')
    })

    expect(result.current.auth.token).toBe('full-token')
    expect(result.current.auth.user?.authType).toBe('FULL')
    expect(result.current.upgradeLoading).toBe(false)
    expect(result.current.authMessage).toBe('Account upgraded successfully.')

    await waitFor(() => {
      expect(result.current.authProfile).toMatchObject({
        isFullAccount: true,
        requiresUpgradeForAdmin: false,
        authType: 'FULL',
      })
    })

    expect(sessionStorage.getItem('authToken')).toBe('full-token')
    expect(JSON.parse(sessionStorage.getItem('user') || '{}')).toMatchObject({ authType: 'FULL' })
  })

  it('blocks admin launch for guest users who still need to upgrade', async () => {
    sessionStorage.setItem('authToken', 'guest-token')
    sessionStorage.setItem(
      'user',
      JSON.stringify({
        id: 'user-1',
        username: 'guest-player',
        role: 'PLAYER',
        authType: 'GUEST',
      })
    )

    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method || 'GET'

      if (url.includes('/api/auth/me') && method === 'GET') {
        return jsonResponse({
          adminRole: null,
          hasAdminAccess: false,
          isFullAccount: false,
          requiresUpgradeForAdmin: true,
          authType: 'GUEST',
          email: 'guest@example.com',
        })
      }

      if (url.includes('/api/auth/handoff/admin') && method === 'POST') {
        return jsonResponse({ code: 'GUEST_UPGRADE_REQUIRED' }, false)
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useAuthSession({ apiUrl: API_URL, adminUrl: ADMIN_URL }))

    await waitFor(() => {
      expect(result.current.auth.token).toBe('guest-token')
    })

    await act(async () => {
      await result.current.handleOpenAdmin()
    })

    expect(result.current.adminLaunchLoading).toBe(false)
    expect(result.current.authMessage).toBe(
      'Upgrade to a full account before opening the admin console.'
    )
  })

  it('stores spectator guest auth and clears all persisted state on logout', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const { result } = renderHook(() => useAuthSession({ apiUrl: API_URL, adminUrl: ADMIN_URL }))

    act(() => {
      result.current.handleGuestSpectatorAuthenticated('spectator-token', {
        id: 'spectator-2',
        username: 'watcher',
        role: 'SPECTATOR',
      })
    })

    expect(result.current.auth).toMatchObject({
      token: 'spectator-token',
      user: {
        id: 'spectator-2',
        username: 'watcher',
        role: 'SPECTATOR',
        authType: 'GUEST',
      },
    })
    expect(result.current.authMessage).toBe(
      'Spectator session ready. You are signed in as a guest account.'
    )

    act(() => {
      result.current.handleLogout()
    })

    expect(result.current.auth).toEqual({ token: null, user: null })
    expect(result.current.authProfile).toBeNull()
    expect(result.current.authMessage).toBeNull()
    expect(sessionStorage.getItem('authToken')).toBeNull()
    expect(sessionStorage.getItem('user')).toBeNull()
  })
})
