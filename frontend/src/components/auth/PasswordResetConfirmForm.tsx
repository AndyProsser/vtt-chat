import { useEffect, useMemo, useState } from 'react'
import { navigateAuthSurface, validateComplexPassword } from '@/components/auth/auth-surface'

type PasswordResetConfirmFormProps = {
  apiUrl: string
}

export function PasswordResetConfirmForm({ apiUrl }: PasswordResetConfirmFormProps) {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', [])
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setVerifyError('Password reset link is missing a token')
        setIsVerifying(false)
        return
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/auth/password-reset/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.message || 'Password reset link is invalid or expired')
        }

        setVerifiedEmail(typeof data.email === 'string' ? data.email : null)
      } catch (error) {
        setVerifyError(
          error instanceof Error ? error.message : 'Password reset link is invalid or expired'
        )
      } finally {
        setIsVerifying(false)
      }
    }

    void verify()
  }, [apiUrl, token])

  const passwordErrors = validateComplexPassword(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifyError(null)

    if (passwordErrors.length > 0) {
      setVerifyError(`Password requirements: ${passwordErrors.join(', ')}`)
      return
    }
    if (password !== passwordConfirm) {
      setVerifyError('Passwords do not match')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`${apiUrl}/api/v1/auth/password-reset/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'Failed to reset password')
      }

      setSuccessMessage('Password updated. You can log in with your new password now.')
      setPassword('')
      setPasswordConfirm('')
    } catch (error) {
      setVerifyError(error instanceof Error ? error.message : 'Failed to reset password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form-card auth-form-stack">
      <div className="auth-form-card__header">
        <div>
          <p className="auth-card__eyebrow">Account Access</p>
          <h2 className="auth-card__title">Set New Password</h2>
        </div>
        <div className="auth-form-card__badge">Verified</div>
      </div>

      {isVerifying ? <div className="auth-status-panel">Verifying reset link...</div> : null}
      {!isVerifying && verifiedEmail ? (
        <div className="auth-status-panel">Verified email: {verifiedEmail}</div>
      ) : null}
      {verifyError ? <div className="auth-alert">{verifyError}</div> : null}
      {successMessage ? <div className="auth-status-panel">{successMessage}</div> : null}

      {!isVerifying && !successMessage && !verifyError ? (
        <>
          <div className="auth-field">
            <label htmlFor="reset-password">New Password</label>
            <input
              id="reset-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="reset-password-confirm">Confirm Password</label>
            <input
              id="reset-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              disabled={isSubmitting}
              autoComplete="new-password"
              required
            />
            <p className="auth-field__hint">
              Complex password required: 8+ chars with uppercase, lowercase, number, and special
              character.
            </p>
          </div>
        </>
      ) : null}

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
        {!successMessage && !isVerifying && !verifyError ? (
          <button type="submit" className="auth-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Set Password'}
          </button>
        ) : null}
      </div>
    </form>
  )
}
