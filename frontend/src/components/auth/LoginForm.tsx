/**
 * Login Page
 * Simple login form for testing authentication.
 * Collects username and role, calls backend login API, and stores JWT.
 */

import { useState } from 'react'
import { Role } from '@shared'
import type { UUID } from '@shared'

interface LoginFormProps {
  apiUrl: string
  onLoginSuccess: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

export function LoginForm({ apiUrl, onLoginSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<Role>(Role.PLAYER)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <form
      onSubmit={handleSubmit}
      className="mx-auto my-8 w-full max-w-md rounded-ui-lg border border-ui-border bg-ui-surface p-8 shadow-ui-sm"
    >
      <h2 className="mt-0 text-2xl font-semibold text-ui-primary">Login</h2>

      {error && (
        <div className="mb-4 rounded-ui-sm bg-ui-error-surface px-3 py-3 text-sm text-ui-error-text">
          {error}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="username" className="mb-2 block text-sm font-medium text-ui-primary">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username (3-32 chars)"
          className="block w-full rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary outline-none focus:border-ui-border-focus"
          disabled={isLoading}
          required
        />
      </div>

      <div className="mb-6">
        <label htmlFor="role" className="mb-2 block text-sm font-medium text-ui-primary">
          Role
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="block w-full rounded-ui-sm border border-ui-border-soft bg-ui-surface px-3 py-2 text-sm text-ui-primary outline-none focus:border-ui-border-focus"
          disabled={isLoading}
        >
          <option value="DM">Dungeon Master (DM)</option>
          <option value="PLAYER">Player</option>
          <option value="SPECTATOR">Spectator</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isLoading || !username.trim()}
        className="w-full rounded-ui-sm bg-ui-brand px-4 py-3 text-sm font-medium text-white hover:bg-ui-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isLoading ? 'Logging in...' : 'Login'}
      </button>

      <p className="mt-4 text-center text-xs text-ui-secondary">
        Stage 1: No password required. Username is verified by length and format only.
      </p>
    </form>
  )
}
