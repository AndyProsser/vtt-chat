import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LoginForm } from '../../components/auth/LoginForm'

describe('LoginForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
  })

  it('shows user access copy and no role tabs', () => {
    render(<LoginForm apiUrl="http://localhost:3000" onLoginSuccess={vi.fn()} />)

    expect(screen.getByText('User access')).toBeTruthy()
    expect(screen.getByText('Sign in as a local user')).toBeTruthy()
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByText('Campaign Role Context')).toBeNull()
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

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'andy_user' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'andy_user',
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
})
