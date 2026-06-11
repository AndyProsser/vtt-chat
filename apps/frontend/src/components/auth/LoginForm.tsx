/**
 * Login Page
 * Simple login form for testing authentication.
 * Collects username, calls backend login API, and stores JWT.
 */

import { useState } from 'react'
import * as Form from '@radix-ui/react-form'
import { Role } from '@shared'
import type { UUID } from '@shared'
import { isDevPasswordlessLoginEnabled, navigateAuthSurface } from '@/utils/authSurface'

interface LoginFormProps {
  apiUrl: string
  onLoginSuccess: (
    token: string,
    user: { id: UUID; username: string; role: Role; accessMode?: 'USER' | 'CAMPAIGN' }
  ) => void
}

export function LoginForm({ apiUrl, onLoginSuccess }: LoginFormProps) {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const passwordlessLoginEnabled = isDevPasswordlessLoginEnabled()

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault()
    setError(null)

    if (passwordlessLoginEnabled && identifier.includes('@')) {
      setError('Passwordless DEV testing only supports usernames.')
      return
    }

    setIsLoading(true)

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: identifier,
          ...(passwordlessLoginEnabled ? {} : { password }),
          accessMode: 'USER',
          role: Role.PLAYER,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Login failed')
      }

      const data = await response.json()
      const { token, user } = data
      onLoginSuccess(token, user)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form.Root onSubmit={handleSubmit} className="auth-form-card">
      <div className="auth-form-card__header">
        <div>
          <p className="auth-card__eyebrow">Account Access</p>
          <h2 className="auth-card__title">Sign in</h2>
        </div>
        <div className="auth-form-card__badge">User access</div>
      </div>

      <p className="auth-form-card__copy">
        Guest accounts cannot sign in here. Use your invite URL to join or rejoin a campaign.
      </p>

      {error && <div className="auth-alert">{error}</div>}

      <Form.Field className="auth-field" name="identifier">
        <Form.Label htmlFor="username-or-email">
          {passwordlessLoginEnabled ? 'Username' : 'Username or Email'}
        </Form.Label>
        <Form.Control asChild>
          <input
            id="username-or-email"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={isLoading}
            autoComplete="username"
            placeholder={passwordlessLoginEnabled ? 'Enter username' : 'Enter username or email'}
            required
          />
        </Form.Control>
        <p className="auth-field__hint">
          {passwordlessLoginEnabled
            ? 'DEV Testing passwordless login uses username only.'
            : 'Use your full account username or email address.'}
        </p>
      </Form.Field>

      <Form.Field className="auth-field" name="password">
        <Form.Label htmlFor="password">Password</Form.Label>
        <Form.Control asChild>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading || passwordlessLoginEnabled}
            autoComplete="current-password"
            placeholder={passwordlessLoginEnabled ? 'Disabled for DEV Testing' : 'Enter password'}
            required={!passwordlessLoginEnabled}
          />
        </Form.Control>
        {passwordlessLoginEnabled ? (
          <p className="auth-field__hint">
            Password is disabled while passwordless DEV Testing is active.
          </p>
        ) : null}
      </Form.Field>

      {passwordlessLoginEnabled && identifier.trim() ? (
        <div className="auth-status-panel">Passwords are not needed in DEV Testing.</div>
      ) : null}

      <Form.Submit asChild>
        <button
          type="submit"
          disabled={isLoading || !identifier.trim() || (!passwordlessLoginEnabled && !password)}
          className="auth-submit"
        >
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </Form.Submit>

      <div className="auth-form-links" aria-label="login help links">
        <a
          className="auth-form-link"
          href="/register"
          onClick={(event) => {
            event.preventDefault()
            navigateAuthSurface('/register')
          }}
        >
          Register
        </a>
        <a
          className="auth-form-link auth-form-link--align-right"
          href="/forgot-password"
          onClick={(event) => {
            event.preventDefault()
            navigateAuthSurface('/forgot-password')
          }}
        >
          Forgot Password
        </a>
      </div>
    </Form.Root>
  )
}
