/**
 * Login Page
 * Simple login form for testing authentication.
 * Collects username and role, calls backend login API, and stores JWT.
 */

import { useState } from 'react'
import { Role } from '@shared'
import type { UUID } from '@shared'
import { Tabs, TabsList, TabsTrigger } from '@/core-ui'

interface LoginFormProps {
  apiUrl: string
  onLoginSuccess: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

const LOGIN_ROLES = [Role.DM, Role.PLAYER, Role.SPECTATOR] as const

type LoginRole = (typeof LOGIN_ROLES)[number]

export function LoginForm({ apiUrl, onLoginSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<LoginRole>(Role.PLAYER)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleCopy: Record<LoginRole, { label: string; summary: string; meta: string }> = {
    [Role.DM]: {
      label: 'DM',
      summary:
        'Enter with DM campaign permissions for room management and orchestration workflows.',
      meta: 'Campaign control',
    },
    [Role.PLAYER]: {
      label: 'Player',
      summary:
        'Enter with Player campaign permissions for chat, notes, and active room participation.',
      meta: 'Focused play',
    },
    [Role.SPECTATOR]: {
      label: 'Spectator',
      summary: 'Enter with Spectator campaign permissions for the read-only audience experience.',
      meta: 'Read-only mode',
    },
  }

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          role,
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
          <p className="auth-card__eyebrow">Enter Session</p>
          <h2 className="auth-card__title">Sign in to the table</h2>
        </div>
        <div className="auth-form-card__badge">Local smoke auth</div>
      </div>

      <p className="auth-form-card__copy">
        Authenticate into the frontend shell and verify campaign-scoped role behavior. Account
        identity is user-level; DM, Player, and Spectator apply within campaign membership.
      </p>

      {error && <div className="auth-alert">{error}</div>}

      <div className="auth-field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="thorin_stonehelm"
          disabled={isLoading}
          required
        />
        <p className="auth-field__hint">
          Use letters, numbers, or underscores. The backend issues a JWT immediately on submit.
        </p>
      </div>

      <div className="auth-field">
        <label htmlFor="role-tabs">Campaign Role Context</label>
        <Tabs
          value={role}
          onValueChange={(nextRole) => {
            if (LOGIN_ROLES.includes(nextRole as LoginRole)) {
              setRole(nextRole as LoginRole)
            }
          }}
          className="auth-role-switcher"
        >
          <TabsList id="role-tabs" aria-label="Choose persona">
            <TabsTrigger value={Role.DM} disabled={isLoading}>
              <span className="auth-role-switcher__label">DM</span>
              <span className="auth-role-switcher__meta">Control</span>
            </TabsTrigger>
            <TabsTrigger value={Role.PLAYER} disabled={isLoading}>
              <span className="auth-role-switcher__label">Player</span>
              <span className="auth-role-switcher__meta">Play</span>
            </TabsTrigger>
            <TabsTrigger value={Role.SPECTATOR} disabled={isLoading}>
              <span className="auth-role-switcher__label">Spectator</span>
              <span className="auth-role-switcher__meta">Observe</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="auth-role-card">
          <p className="auth-role-card__title">
            {roleCopy[role].label} surface · {roleCopy[role].meta}
          </p>
          <p className="auth-role-card__copy">{roleCopy[role].summary}</p>
        </div>
      </div>

      <button type="submit" disabled={isLoading || !username.trim()} className="auth-submit">
        {isLoading ? 'Logging in...' : 'Login'}
      </button>

      <div className="auth-form-meta">
        <span>Fast local access for smoke testing</span>
        <span className="auth-pill">JWT issued on submit</span>
      </div>
    </form>
  )
}
