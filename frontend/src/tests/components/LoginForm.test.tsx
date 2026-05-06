import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LoginForm } from '../../components/auth/LoginForm'

describe('LoginForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    sessionStorage.clear()
  })

  it('shows login fields and help links for standard sign in', () => {
    render(<LoginForm apiUrl="http://localhost:3000" onLoginSuccess={vi.fn()} />)

    expect(screen.getByText('User access')).toBeTruthy()
    expect(
      screen.getByText(
        'Guest accounts cannot sign in here. Use your invite URL to join or rejoin a campaign.'
      )
    ).toBeTruthy()
    expect(screen.getByLabelText('Username or Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Login' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Register' }).getAttribute('href')).toBe('/register')
    expect(screen.getByRole('link', { name: 'Forgot Password' }).getAttribute('href')).toBe(
      '/forgot-password'
    )
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('Campaign Role Context')).toBeNull()
    expect(screen.queryByText('User first')).toBeNull()
    expect(screen.queryByText('Invite-first authentication')).toBeNull()
  })

  it('submits explicit user access login', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        token: 'jwt-token',
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          username: 'andy_user',
          role: 'PLAYER',
          accessMode: 'USER',
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const onLoginSuccess = vi.fn()
    render(<LoginForm apiUrl="http://localhost:3000" onLoginSuccess={onLoginSuccess} />)

    fireEvent.change(screen.getByLabelText('Username or Email'), {
      target: { value: 'andy_user' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ValidPassword!23' } })
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'andy_user',
            password: 'ValidPassword!23',
            accessMode: 'USER',
            role: 'PLAYER',
          }),
        })
      )
    })

    await waitFor(() => {
      expect(onLoginSuccess).toHaveBeenCalledWith(
        'jwt-token',
        expect.objectContaining({
          username: 'andy_user',
          accessMode: 'USER',
        })
      )
    })
  })

  it('disables password field during DEV smoke test mode', () => {
    vi.stubEnv('VITE_ENABLE_PASSWORDLESS_LOGIN', '1')

    render(<LoginForm apiUrl="http://localhost:3000" onLoginSuccess={vi.fn()} />)

    expect(screen.getByLabelText('Username')).toBeTruthy()
    expect(screen.getByLabelText('Password').hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'devtester' } })

    expect(screen.getByText("Passwords aren't needed in DEV Testing.")).toBeTruthy()
  })
})
