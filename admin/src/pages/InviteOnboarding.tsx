import { FormEvent, useEffect, useState } from 'react'
import { adminApiBase, requestJson } from '../utils/api'

interface InviteValidation {
  valid: boolean
  invitedRole: 'ADMIN' | 'CAMPAIGN_DM' | 'READ_ONLY'
  email: string | null
  expiresAt: string
}

interface InviteOnboardingProps {
  inviteToken: string
  onComplete: (token: string, admin: { id: string; username: string; email: string }) => void
  onError: (error: string) => void
}

export default function InviteOnboarding({
  inviteToken,
  onComplete,
  onError,
}: InviteOnboardingProps) {
  const [validation, setValidation] = useState<InviteValidation | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  useEffect(() => {
    const validate = async () => {
      setLoading(true)
      try {
        const result = await requestJson<InviteValidation>(
          `/invites/validate?token=${encodeURIComponent(inviteToken)}`,
          {
            method: 'GET',
          }
        )
        setValidation(result)
        if (result.email) {
          setEmail(result.email)
        }
        onError('')
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to validate invite')
      } finally {
        setLoading(false)
      }
    }

    void validate()
  }, [inviteToken, onError])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)

    try {
      const result = await requestJson<{
        token: string
        admin: { id: string; username: string; email: string }
      }>('/invites/redeem', {
        method: 'POST',
        body: JSON.stringify({
          token: inviteToken,
          username,
          email,
          password,
          passwordConfirm,
        }),
      })

      window.history.replaceState({}, document.title, window.location.pathname)
      onComplete(result.token, result.admin)
      onError('')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to redeem invite')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="setup-wizard">
        <div className="setup-container">
          <h1>Admin Invite</h1>
          <p>Validating invite link...</p>
        </div>
      </div>
    )
  }

  if (!validation) {
    return (
      <div className="setup-wizard">
        <div className="setup-container">
          <h1>Invite Invalid</h1>
          <p>This invite is invalid or expired.</p>
          <p>API: {adminApiBase()}/invites/validate</p>
        </div>
      </div>
    )
  }

  return (
    <div className="setup-wizard">
      <div className="setup-container">
        <h1>Join Admin</h1>
        <p>
          This invite grants <strong>{validation.invitedRole}</strong> access and expires on{' '}
          <strong>{new Date(validation.expiresAt).toLocaleString()}</strong>.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="invite-username">Username</label>
            <input
              id="invite-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={Boolean(validation.email)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="invite-password">Password</label>
            <input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="invite-password-confirm">Confirm Password</label>
            <input
              id="invite-password-confirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="setup-button" disabled={submitting}>
            {submitting ? 'Creating Admin Access...' : 'Redeem Invite'}
          </button>
        </form>
      </div>
    </div>
  )
}
