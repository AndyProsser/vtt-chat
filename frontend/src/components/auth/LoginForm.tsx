/**
 * Login Page
 * Simple login form for testing authentication.
 * Collects username, calls backend login API, and stores JWT.
 */

import { useState } from 'react'
import { Role } from '@shared'
import type { UUID } from '@shared'

interface LoginFormProps {
  apiUrl: string
  onLoginSuccess: (
    token: string,
    user: { id: UUID; username: string; role: Role; accessMode?: 'USER' | 'CAMPAIGN' }
  ) => void
}

export function LoginForm({ apiUrl, onLoginSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
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

      // Store token
      sessionStorage.setItem('authToken', token)
      sessionStorage.setItem('user', JSON.stringify(user))

      // Callback to parent
      onLoginSuccess(token, user)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form-card">
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

      <div className="auth-field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={isLoading}
          required
        />
        <p className="auth-field__hint">Letters, numbers, and underscores only.</p>
      </div>

      <div className="auth-form-note">
        <strong>User first</strong>
        <p>DM, Player, and Spectator are campaign roles, not login roles.</p>
      </div>

      <button type="submit" disabled={isLoading || !username.trim()} className="auth-submit">
        {isLoading ? 'Signing in...' : 'Continue'}
      </button>

      <div className="auth-form-meta">
        <span>Invite-first authentication</span>
        <span className="auth-pill">Guest login disabled here</span>
      </div>
    </form>
  )
}
