import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseStore, setStoreState } = vi.hoisted(() => {
  type Room = {
    id: string
    sessionId: string
    type: 'MAIN' | 'GROUP' | 'PRIVATE'
  }

  type StoreState = {
    currentSessionId?: string
    rooms: Record<string, Record<string, Room>>
  }

  let state: StoreState = {
    currentSessionId: undefined,
    rooms: {},
  }

  return {
    mockUseStore: vi.fn((selector: (s: StoreState) => unknown) => selector(state)),
    setStoreState: (next: Partial<StoreState>) => {
      state = {
        ...state,
        ...next,
      }
    },
  }
})

vi.mock('../../hooks/useStore', () => ({
  useStore: (selector: (state: any) => unknown) => mockUseStore(selector),
}))

vi.mock('../../components/auth/LoginForm', () => ({
  LoginForm: () => <div>Mock Login Form</div>,
}))

vi.mock('../../components/session/SessionInit', () => ({
  SessionInit: ({ token, user }: { token: string; user: { username: string } }) => (
    <div>
      Session Init Mounted: {token}:{user.username}
    </div>
  ),
}))

vi.mock('../../components/audio/AudioPanel', () => ({
  AudioPanel: ({ sessionId, roomId }: { sessionId: string; roomId: string }) => (
    <div>
      Audio Panel Mounted: {sessionId}:{roomId}
    </div>
  ),
}))

describe('guest upgrade prompt visibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setStoreState({
      currentSessionId: undefined,
      rooms: {},
    })
    sessionStorage.clear()
  })

  it('shows upgrade prompt for guest users outside active sessions', async () => {
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

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.includes('/api/auth/me')) {
          return {
            ok: true,
            json: async () => ({
              id: 'user-1',
              username: 'guest-player',
              role: 'PLAYER',
              authType: 'GUEST',
              adminRole: null,
              hasAdminAccess: false,
              isFullAccount: false,
              requiresUpgradeForAdmin: true,
              email: 'guest@example.com',
            }),
          }
        }

        throw new Error(`Unexpected fetch call: ${url}`)
      })
    )

    const { default: App } = await import('../../App')
    render(<App />)

    await screen.findByText('Guest Account')
    expect(screen.getByDisplayValue('guest@example.com')).toBeTruthy()
  })

  it('hides upgrade prompt during active sessions', async () => {
    const sessionId = 'session-1'
    const roomId = 'room-1'
    setStoreState({
      currentSessionId: sessionId,
      rooms: {
        [sessionId]: {
          [roomId]: {
            id: roomId,
            sessionId,
            type: 'MAIN',
          },
        },
      },
    })

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

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.includes('/api/auth/me')) {
          return {
            ok: true,
            json: async () => ({
              id: 'user-1',
              username: 'guest-player',
              role: 'PLAYER',
              authType: 'GUEST',
              adminRole: null,
              hasAdminAccess: false,
              isFullAccount: false,
              requiresUpgradeForAdmin: true,
              email: 'guest@example.com',
            }),
          }
        }

        throw new Error(`Unexpected fetch call: ${url}`)
      })
    )

    const { default: App } = await import('../../App')
    render(<App />)

    await screen.findByText(/Session Init Mounted:/)

    await waitFor(() => {
      expect(screen.queryByText('Guest Account')).toBeNull()
    })
  })

  it('allows dismissing the guest upgrade prompt', async () => {
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

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.includes('/api/auth/me')) {
          return {
            ok: true,
            json: async () => ({
              id: 'user-1',
              username: 'guest-player',
              role: 'PLAYER',
              authType: 'GUEST',
              adminRole: null,
              hasAdminAccess: false,
              isFullAccount: false,
              requiresUpgradeForAdmin: true,
              email: 'guest@example.com',
            }),
          }
        }

        throw new Error(`Unexpected fetch call: ${url}`)
      })
    )

    const { default: App } = await import('../../App')
    render(<App />)

    await screen.findByText('Guest Account')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => {
      expect(screen.queryByText('Guest Account')).toBeNull()
    })
  })

  it('upgrades guest account and swaps token/session auth type', async () => {
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
        const authorizationHeader = String(
          init?.headers ? (init.headers as Record<string, string>).Authorization || '' : ''
        )
        const isFullSession = authorizationHeader.includes('full-token')
        return {
          ok: true,
          json: async () => ({
            id: 'user-1',
            username: 'guest-player',
            role: 'PLAYER',
            authType: isFullSession ? 'FULL' : 'GUEST',
            adminRole: null,
            hasAdminAccess: false,
            isFullAccount: isFullSession,
            requiresUpgradeForAdmin: !isFullSession,
            email: 'guest@example.com',
          }),
        }
      }

      if (url.includes('/api/auth/upgrade') && method === 'POST') {
        return {
          ok: true,
          json: async () => ({
            token: 'full-token',
            user: {
              id: 'user-1',
              username: 'guest-player',
              role: 'PLAYER',
              authType: 'FULL',
            },
          }),
        }
      }

      throw new Error(`Unexpected fetch call: ${method} ${url}`)
    })

    vi.stubGlobal('fetch', fetchMock)

    const { default: App } = await import('../../App')
    render(<App />)

    await screen.findByText('Guest Account')
    fireEvent.change(screen.getByPlaceholderText('Create a secure password'), {
      target: { value: 'VeryStrongPass!123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }))

    await screen.findByText('Account upgraded successfully.')
    await waitFor(() => {
      expect(screen.queryByText('Guest Account')).toBeNull()
    })

    const upgradeCall = fetchMock.mock.calls.find(([input, init]) => {
      return String(input).includes('/api/auth/upgrade') && (init?.method || 'GET') === 'POST'
    })
    expect(upgradeCall).toBeTruthy()
    const body = JSON.parse(String(upgradeCall?.[1]?.body || '{}'))
    expect(body.password).toBe('VeryStrongPass!123')

    expect(sessionStorage.getItem('authToken')).toBe('full-token')
    const storedUser = JSON.parse(sessionStorage.getItem('user') || '{}')
    expect(storedUser.authType).toBe('FULL')
  })
})
