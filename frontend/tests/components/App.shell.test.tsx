import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_SPLASH_TITLES } from '@/constants/appMainRoute.constants'
import type { AppShellStoreState } from '../types/app-shell.types'

const { mockUseStore, setStoreState } = vi.hoisted(() => {
  let state: AppShellStoreState = {
    currentSessionId: undefined,
    rooms: {},
  }

  return {
    mockUseStore: vi.fn((selector: (s: AppShellStoreState) => unknown) => selector(state)),
    setStoreState: (next: Partial<AppShellStoreState>) => {
      state = {
        ...state,
        ...next,
      }
    },
  }
})

vi.mock('../../src/hooks/useStore', () => ({
  useStore: (selector: (state: any) => unknown) => mockUseStore(selector),
}))

vi.mock('../../src/components/auth/LoginForm', () => ({
  LoginForm: ({ onLoginSuccess }: { onLoginSuccess: (token: string, user: any) => void }) => (
    <div>
      <div>Mock Login Form</div>
      <button
        onClick={() =>
          onLoginSuccess('jwt-token', {
            id: 'user-1',
            username: 'andy',
            role: 'DM',
          })
        }
      >
        Complete Login
      </button>
    </div>
  ),
}))

vi.mock('../../src/components/workspaces', () => ({
  WorkspaceInitialization: ({ token, user }: { token: string; user: { username: string } }) => (
    <div>
      Session Init Mounted: {token}:{user.username}
    </div>
  ),
}))

vi.mock('../../src/components/audio/AudioPanel', () => ({
  AudioPanel: ({ sessionId, roomId }: { sessionId: string; roomId: string }) => (
    <div>
      Audio Panel Mounted: {sessionId}:{roomId}
    </div>
  ),
}))

describe('App shell', () => {
  beforeEach(() => {
    setStoreState({
      currentSessionId: undefined,
      rooms: {},
    })
    mockUseStore.mockClear()
    sessionStorage.clear()
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
    window.history.pushState({}, '', '/')
  })

  it('renders unauthenticated login surface by default', async () => {
    const { default: App } = await import('../../src/App')

    render(<App />)

    expect(screen.getByLabelText('VTT Chat auth brand header')).toBeTruthy()
    expect(screen.getByText('VTT-CHAT')).toBeTruthy()
    const splashTaglineMatcher = new RegExp(APP_SPLASH_TITLES.join('|'))
    expect(screen.getByText(splashTaglineMatcher)).toBeTruthy()
    expect(screen.getByText('Mock Login Form')).toBeTruthy()
    expect(screen.queryByText(/Session Init Mounted:/)).toBeNull()
    expect(screen.queryByText(/Audio Panel Mounted:/)).toBeNull()
  })

  it('mounts session UI and audio controls when authenticated', async () => {
    const sessionId = '33333333-3333-4333-8333-333333333333'
    const roomId = '44444444-4444-4444-8444-444444444444'
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

    const { default: App } = await import('../../src/App')

    render(<App />)

    fireEvent.click(screen.getByText('Complete Login'))

    expect(await screen.findByText('Session Init Mounted: jwt-token:andy')).toBeTruthy()
    expect(screen.queryByText('Mock Login Form')).toBeNull()
  })

  it('renders current auth brand shell', async () => {
    const { default: App } = await import('../../src/App')

    render(<App />)

    expect(screen.getByLabelText('VTT Chat auth brand header')).toBeTruthy()
    expect(screen.getByText('Mock Login Form')).toBeTruthy()
  })
})
