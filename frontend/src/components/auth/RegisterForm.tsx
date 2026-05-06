import { useEffect, useState } from 'react'
import { Role } from '@shared'
import type { UUID } from '@shared'
import {
  isDevPasswordlessLoginEnabled,
  navigateAuthSurface,
  normalizeUsernameFromName,
  validateComplexPassword,
} from '@/components/auth/auth-surface'

type RegisterFormProps = {
  apiUrl: string
  onLoginSuccess: (
    token: string,
    user: { id: UUID; username: string; role: Role; accessMode?: 'USER' | 'CAMPAIGN' }
  ) => void
}

export function RegisterForm({ apiUrl, onLoginSuccess }: RegisterFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('user')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [usernameCustomized, setUsernameCustomized] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const passwordlessLoginEnabled = isDevPasswordlessLoginEnabled()

  useEffect(() => {
    if (!usernameCustomized) {
      setUsername(normalizeUsernameFromName(name || 'user'))
    }
  }, [name, usernameCustomized])

  const syncSuggestedUsername = async (nextName: string, nextUsername: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/register/username-suggestion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nextName,
          username: nextUsername,
        }),
      })

      if (!response.ok) {
        return
      }

      const data = await response.json()
      if (typeof data.username === 'string' && data.username.trim()) {
        setUsername(data.username.trim())
      }
    } catch {
      // Keep local username if suggestion lookup fails.
    }
  }

  const passwordErrors = validateComplexPassword(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    if (!passwordlessLoginEnabled && passwordErrors.length > 0) {
      setError(`Password requirements: ${passwordErrors.join(', ')}`)
      return
    }
    if (!passwordlessLoginEnabled && password !== passwordConfirm) {
      setError('Passwords do not match')
      return
    }

    const passwordToSubmit = passwordlessLoginEnabled ? 'DevPass!1' : password

    setIsLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          username,
          password: passwordToSubmit,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'Registration failed')
      }

      onLoginSuccess(data.token, data.user)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Registration failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form-card auth-form-stack">
      <div className="auth-form-card__header">
        <div>
          <p className="auth-card__eyebrow">Account Access</p>
          <h2 className="auth-card__title">Register</h2>
        </div>
        <div className="auth-form-card__badge">Full account</div>
      </div>

      <p className="auth-form-card__copy">
        Create a full account for direct login, admin handoff, and future password recovery.
      </p>

      {error ? <div className="auth-alert">{error}</div> : null}

      <div className="auth-field">
        <label htmlFor="register-name">Name</label>
        <input
          id="register-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void syncSuggestedUsername(name, username)}
          disabled={isLoading}
          autoComplete="name"
          required
        />
      </div>

      <div className="auth-field">
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isLoading}
          autoComplete="email"
          required
        />
      </div>

      <div className="auth-field">
        <label htmlFor="register-username">Username</label>
        <input
          id="register-username"
          type="text"
          value={username}
          onChange={(e) => {
            setUsernameCustomized(true)
            setUsername(normalizeUsernameFromName(e.target.value || 'user'))
          }}
          onBlur={() => void syncSuggestedUsername(name, username)}
          disabled={isLoading}
          autoComplete="username"
          required
        />
        <p className="auth-field__hint">
          Auto-generated from your name. Letters, numbers, and underscores only. If taken, we add
          random digits automatically.
        </p>
      </div>

      <div className="auth-field">
        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isLoading || passwordlessLoginEnabled}
          autoComplete="new-password"
          placeholder={passwordlessLoginEnabled ? 'Disabled for DEV Testing' : 'Enter password'}
          required={!passwordlessLoginEnabled}
        />
      </div>

      <div className="auth-field">
        <label htmlFor="register-password-confirm">Confirm Password</label>
        <input
          id="register-password-confirm"
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          disabled={isLoading || passwordlessLoginEnabled}
          autoComplete="new-password"
          placeholder={passwordlessLoginEnabled ? 'Disabled for DEV Testing' : 'Confirm password'}
          required={!passwordlessLoginEnabled}
        />
        <p className="auth-field__hint">
          {passwordlessLoginEnabled
            ? 'Password fields are disabled while passwordless DEV Testing is active.'
            : 'Complex password required: 8+ chars with uppercase, lowercase, number, and special character.'}
        </p>
      </div>

      <div className="auth-button-row">
        <button
          type="button"
          className="auth-button-secondary"
          onClick={() => navigateAuthSurface('/')}
        >
          <span className="auth-button-icon" aria-hidden="true">
            &larr;
          </span>
          Back
        </button>
        <button type="submit" className="auth-submit" disabled={isLoading}>
          {isLoading ? 'Creating account...' : 'Register'}
        </button>
      </div>
    </form>
  )
}
