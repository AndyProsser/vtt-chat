import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../store'

describe('admin auth store', () => {
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
  })

  it('logs in successfully and persists session token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'admin-jwt',
        admin: {
          id: 'user-1',
          username: 'admin-user',
          email: 'admin@example.com',
          adminRole: 'ADMIN',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await useAuthStore.getState().login('admin-user', 'password')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.token).toBe('admin-jwt')
    expect(state.admin?.username).toBe('admin-user')
    expect(sessionStorage.getItem('admin-token')).toBe('admin-jwt')
  })

  it('sets error and rejects when login fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(useAuthStore.getState().login('admin-user', 'wrong')).rejects.toThrow(
      'Invalid credentials'
    )

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.error).toBe('Invalid credentials')
    expect(state.token).toBeNull()
  })

  it('restores token from storage via initializeAuth', () => {
    localStorage.setItem('admin-token', 'stored-token')

    useAuthStore.getState().initializeAuth()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.token).toBe('stored-token')
  })

  it('clears auth state and stored tokens on logout', () => {
    sessionStorage.setItem('admin-token', 'session-token')
    localStorage.setItem('admin-token', 'local-token')

    useAuthStore.setState({
      token: 'session-token',
      admin: {
        id: 'user-1',
        username: 'admin-user',
        email: 'admin@example.com',
      },
      isAuthenticated: true,
      error: 'some error',
    })

    useAuthStore.getState().logout()

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.token).toBeNull()
    expect(state.admin).toBeNull()
    expect(state.error).toBeNull()
    expect(sessionStorage.getItem('admin-token')).toBeNull()
    expect(localStorage.getItem('admin-token')).toBeNull()
  })
})
