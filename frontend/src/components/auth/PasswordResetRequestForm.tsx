import { useState, type FormEventHandler } from 'react'
import * as Form from '@radix-ui/react-form'
import { navigateAuthSurface } from '@/components/auth/auth-surface'

type PasswordResetRequestFormProps = {
  apiUrl: string
}

export function PasswordResetRequestForm({ apiUrl }: PasswordResetRequestFormProps) {
  const [identifier, setIdentifier] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccessMessage(null)
    setIsLoading(true)

    try {
      const response = await fetch(`${apiUrl}/api/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setIdentifier('')
        throw new Error(data.message || 'Unable to start password reset')
      }

      if (data.delivery === 'passwordless' && typeof data.resetToken === 'string') {
        navigateAuthSurface(`/reset-password?token=${encodeURIComponent(data.resetToken)}`)
        return
      }

      setSuccessMessage('Check your email for a password reset link.')
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to start password reset'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form.Root onSubmit={handleSubmit} className="auth-form-card auth-form-stack">
      <div className="auth-form-card__header">
        <div>
          <p className="auth-card__eyebrow">Account Access</p>
          <h2 className="auth-card__title">Reset Password</h2>
        </div>
        <div className="auth-form-card__badge">Recovery</div>
      </div>

      <p className="auth-form-card__copy">
        Enter your username or email and we will start the password reset flow.
      </p>

      {error ? <div className="auth-alert">{error}</div> : null}
      {successMessage ? <div className="auth-status-panel">{successMessage}</div> : null}

      <Form.Field className="auth-field" name="identifier">
        <Form.Label htmlFor="reset-identifier">Username or Email</Form.Label>
        <Form.Control asChild>
          <input
            id="reset-identifier"
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={isLoading}
            autoComplete="username"
            required
          />
        </Form.Control>
      </Form.Field>

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
        <Form.Submit asChild>
          <button type="submit" className="auth-submit" disabled={isLoading || !identifier.trim()}>
            {isLoading ? 'Starting reset...' : 'Continue'}
          </button>
        </Form.Submit>
      </div>
    </Form.Root>
  )
}
