import { fireEvent, render, screen } from '@testing-library/react'
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

describe('App shell', () => {
  beforeEach(() => {
    setStoreState({
      currentSessionId: undefined,
      rooms: {},
    })
    mockUseStore.mockClear()
  })

  it('renders unauthenticated login surface by default', async () => {
    const { default: App } = await import('../../App')

    render(<App />)

    expect(screen.getByText('Welcome to VTT-Chat')).toBeTruthy()
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

    const { default: App } = await import('../../App')

    render(<App />)

    fireEvent.click(screen.getByText('Complete Login'))

    expect(await screen.findByText('Session Init Mounted: jwt-token:andy')).toBeTruthy()
    expect(await screen.findByText(`Audio Panel Mounted: ${sessionId}:${roomId}`)).toBeTruthy()
    expect(screen.queryByText('Mock Login Form')).toBeNull()
  })

  it('renders stage footer metadata for active integration stage', async () => {
    const { default: App } = await import('../../App')

    render(<App />)

    expect(screen.getByText('Stage 7: Audio & LiveKit Integration')).toBeTruthy()
    expect(
      screen.getByText(
        'Stage 7 Active: Audio & LiveKit Integration (voice rooms, DSP engine, DM overrides)'
      )
    ).toBeTruthy()
  })
})
