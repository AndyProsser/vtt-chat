/**
 * Login Page
 * Simple login form for testing authentication.
 * Collects username and role, calls backend login API, and stores JWT.
 */

import { useState } from 'react'
import type { UUID, Role } from '@shared'

interface LoginFormProps {
  apiUrl: string
  onLoginSuccess: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

export function LoginForm({ apiUrl, onLoginSuccess }: LoginFormProps) {
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<Role>('PLAYER')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
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
      style={{
        maxWidth: '400px',
        margin: '2rem auto',
        padding: '2rem',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <h2 style={{ marginTop: 0 }}>Login</h2>

      {error && (
        <div
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <label
          htmlFor="username"
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: '500',
            fontSize: '0.875rem',
          }}
        >
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username (3-32 chars)"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontSize: '0.875rem',
            boxSizing: 'border-box',
          }}
          disabled={isLoading}
          required
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label
          htmlFor="role"
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontWeight: '500',
            fontSize: '0.875rem',
          }}
        >
          Role
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontSize: '0.875rem',
            boxSizing: 'border-box',
          }}
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
        style={{
          width: '100%',
          padding: '0.75rem',
          backgroundColor: isLoading || !username.trim() ? '#cbd5e1' : '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontWeight: '500',
          cursor: isLoading || !username.trim() ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
        }}
      >
        {isLoading ? 'Logging in...' : 'Login'}
      </button>

      <p
        style={{
          marginTop: '1rem',
          fontSize: '0.75rem',
          color: '#64748b',
          textAlign: 'center',
        }}
      >
        Stage 1: No password required. Username is verified by length and format only.
      </p>
    </form>
  )
}
