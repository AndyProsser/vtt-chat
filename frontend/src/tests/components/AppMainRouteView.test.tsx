import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { Role } from '@shared'
import type { UUID } from '@shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppMainRouteView } from '../../components/routes/AppMainRouteView'
import { AUTH_FEATURE_CARDS } from '@/constants/appMainRoute.constants'

vi.mock('../../components/auth/LoginForm', () => ({
  LoginForm: () => <div>Mock Login Form</div>,
}))

vi.mock('../../components/auth/RegisterForm', () => ({
  RegisterForm: () => <div>Mock Register Form</div>,
}))

vi.mock('../../components/auth/PasswordResetRequestForm', () => ({
  PasswordResetRequestForm: () => <div>Mock Password Reset Request Form</div>,
}))

vi.mock('../../components/auth/PasswordResetConfirmForm', () => ({
  PasswordResetConfirmForm: () => <div>Mock Password Reset Confirm Form</div>,
}))

vi.mock('../../components/auth/auth-surface', () => ({
  resolveAuthSurfaceRoute: () => 'login',
}))

vi.mock('../../components/session/SessionInit', () => ({
  SessionInit: ({ onReady }: { onReady?: () => void }) => {
    useEffect(() => {
      onReady?.()
    }, [onReady])

    return <div>Mock Session Init</div>
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

  it('renders auth feature cards from centralized constants', async () => {
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

    for (const card of AUTH_FEATURE_CARDS) {
      expect(screen.getByText(card.title)).toBeTruthy()
      expect(screen.getByText(card.copy)).toBeTruthy()
    }
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
})
