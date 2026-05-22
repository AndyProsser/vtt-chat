import { act, render, screen } from '@testing-library/react'
import { Role } from '@shared'
import type { UUID } from '@shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppMainRouteView } from '../../src/components/routes/AppMainRouteView'
import { APP_SPLASH_TITLES } from '@/constants/appMainRoute.constants'

vi.mock('../../src/components/auth/LoginForm', () => ({
  LoginForm: () => <div>Mock Login Form</div>,
}))

vi.mock('../../src/components/auth/RegisterForm', () => ({
  RegisterForm: () => <div>Mock Register Form</div>,
}))

vi.mock('../../src/components/auth/PasswordResetRequestForm', () => ({
  PasswordResetRequestForm: () => <div>Mock Password Reset Request Form</div>,
}))

vi.mock('../../src/components/auth/PasswordResetConfirmForm', () => ({
  PasswordResetConfirmForm: () => <div>Mock Password Reset Confirm Form</div>,
}))

vi.mock('../../src/components/auth/auth-surface', () => ({
  resolveAuthSurfaceRoute: () => 'login',
}))

vi.mock('../../src/components/session/Workspaces', () => ({
  Workspaces: ({ onReady }: { onReady?: () => void }) => {
    return (
      <div>
        <div>Mock Session Init</div>
        <button type="button" onClick={() => onReady?.()}>
          Trigger Session Ready
        </button>
      </div>
    )
  },
}))

const asUuid = (value: string) => value as UUID

describe('AppMainRouteView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders auth brand shell with centralized splash titles', async () => {
    await act(async () => {
      render(
        <AppMainRouteView
          apiUrl="http://localhost:3000"
          wsUrl="ws://localhost:3000"
          auth={{ token: null, user: null }}
          onLoginSuccess={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(screen.getByLabelText('VTT Chat auth brand header')).toBeTruthy()
    expect(screen.getByText('VTT-CHAT')).toBeTruthy()
    const splashTaglineMatcher = new RegExp(APP_SPLASH_TITLES.join('|'))
    expect(screen.getByText(splashTaglineMatcher)).toBeTruthy()
  })

  it('cleans splash interval and pending timeout on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    let unmount: () => void = () => undefined
    await act(async () => {
      const rendered = render(
        <AppMainRouteView
          apiUrl="http://localhost:3000"
          wsUrl="ws://localhost:3000"
          auth={{
            token: 'token',
            user: {
              id: asUuid('11111111-1111-4111-8111-111111111111'),
              username: 'dm',
              role: Role.DM,
              authType: 'FULL',
            },
          }}
          onLoginSuccess={vi.fn()}
        />
      )
      unmount = rendered.unmount
      await Promise.resolve()
    })

    act(() => {
      vi.advanceTimersByTime(2500)
    })

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('resets session readiness when auth session key changes', async () => {
    const userId = asUuid('11111111-1111-4111-8111-111111111111')
    const getOverlay = () => document.querySelector('.app-splash-overlay') as HTMLDivElement | null

    const { rerender } = render(
      <AppMainRouteView
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        auth={{
          token: 'token-a',
          user: {
            id: userId,
            username: 'dm',
            role: Role.DM,
            authType: 'FULL',
          },
        }}
        onLoginSuccess={vi.fn()}
      />
    )

    const overlay = getOverlay()
    expect(overlay).toBeTruthy()
    if (!overlay) {
      throw new Error('Expected splash overlay to render')
    }
    expect(overlay.className.includes('is-fading-out')).toBe(false)

    await act(async () => {
      screen.getByRole('button', { name: 'Trigger Session Ready' }).click()
    })

    expect(getOverlay()?.className.includes('is-fading-out')).toBe(true)

    rerender(
      <AppMainRouteView
        apiUrl="http://localhost:3000"
        wsUrl="ws://localhost:3000"
        auth={{
          token: 'token-b',
          user: {
            id: userId,
            username: 'dm',
            role: Role.DM,
            authType: 'FULL',
          },
        }}
        onLoginSuccess={vi.fn()}
      />
    )

    expect(getOverlay()?.className.includes('is-fading-out')).toBe(false)
  })
})
