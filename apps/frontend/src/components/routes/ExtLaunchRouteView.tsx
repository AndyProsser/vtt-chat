/**
 * Extension Launch Route (/ext-launch)
 *
 * Handles auth completion for extension-triggered launches. Two scenarios:
 *  - token param present: validate it via /api/auth/me, then redirect to campaign workspace
 *  - hint param present (no token): show login form for full-account login, then redirect
 *
 * In production: the email field is pre-filled from the DDB hint and locked — the DM must
 * enter their password for the matching vtt-chat account.
 *
 * In DEV (import.meta.env.DEV): the username field is editable so the developer can type
 * their local vtt-chat username (e.g. "test") regardless of what DDB email the extension
 * provides as the hint. This is necessary because DEV passwordless mode rejects email-format
 * logins, and the same DDB identity is often used for both DM and player testing.
 *
 * Never shows invite-code entry — that belongs to the /join flow.
 * On auth success, sets postLoginRedirectPath so App.tsx navigates to the campaign.
 */

import { useEffect, useRef, useState } from 'react'
import * as Form from '@radix-ui/react-form'
import { Role } from '@shared'
import type { UUID } from '@shared'
import { ACTIVE_SESSION_CONTEXT_STORAGE_KEY } from '@/constants/workspaces.constants'
import '@/styles/components/routes/AuthSurface.css'

const isDev = import.meta.env.DEV

interface ExtLaunchRouteViewProps {
  apiUrl: string
  campaignId: string
  sessionId: string
  token?: string
  hint?: string
  onFullAccountAuthenticated: (
    token: string,
    user: { id: UUID; username: string; role: Role }
  ) => void
  onGuestAuthenticated: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

export function ExtLaunchRouteView({
  apiUrl,
  campaignId,
  sessionId,
  token,
  hint,
  onFullAccountAuthenticated,
  onGuestAuthenticated,
}: ExtLaunchRouteViewProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [password, setPassword] = useState('')
  // In DEV: username is editable so the developer can type their local account name.
  // In PROD: locked to the DDB hint (email); this state is never surfaced.
  const [devUsername, setDevUsername] = useState('')
  const tokenExchangedRef = useRef(false)

  const redirectToCampaign = () => {
    if (!campaignId) return
    const context = JSON.stringify({ campaignId, sessionId })
    sessionStorage.setItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY, context)
    sessionStorage.setItem('postLoginRedirectPath', `/campaigns/${campaignId}`)
  }

  // Auto-authenticate when a token is provided in the URL.
  useEffect(() => {
    if (!token) return
    if (tokenExchangedRef.current) return
    tokenExchangedRef.current = true

    const authenticate = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`${apiUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.message || 'Token is invalid or has expired')
        }

        const data = await res.json()
        const user = {
          id: data.id as UUID,
          username: String(data.username || data.displayName || 'user'),
          role: (data.role as Role) || Role.PLAYER,
        }

        redirectToCampaign()

        if (data.authType === 'GUEST' || data.isFullAccount === false) {
          onGuestAuthenticated(token, user)
        } else {
          onFullAccountAuthenticated(token, user)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed')
        setIsLoading(false)
      }
    }

    void authenticate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    // In DEV: use the typed username. In PROD: use the locked hint (DDB email).
    const loginIdentifier = isDev ? devUsername.trim() : hint
    if (!loginIdentifier) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginIdentifier,
          password,
          accessMode: 'USER',
          role: Role.PLAYER,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Login failed')

      const user = {
        id: data.user.id as UUID,
        username: String(data.user.username || data.user.displayName || 'user'),
        role: (data.user.role as Role) || Role.PLAYER,
      }

      redirectToCampaign()
      onFullAccountAuthenticated(data.token, user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  if (!campaignId) {
    return (
      <div className="auth-form-pane">
        <div className="auth-form-shell">
          <div className="auth-alert">Invalid launch link — missing campaign ID.</div>
        </div>
      </div>
    )
  }

  // Token path: show loading or error while auto-authenticating.
  if (token) {
    return (
      <div className="auth-form-pane">
        <div className="auth-form-shell">
          {isLoading && <div className="auth-status-panel">Connecting to your session&hellip;</div>}
          {error && (
            <div className="auth-form-card">
              <div className="auth-form-card__header">
                <div>
                  <p className="auth-card__eyebrow">Extension Launch</p>
                  <h2 className="auth-card__title">Authentication failed</h2>
                </div>
              </div>
              <div className="auth-alert">{error}</div>
              <button
                type="button"
                className="auth-submit"
                onClick={() => {
                  tokenExchangedRef.current = false
                  setError(null)
                  setIsLoading(true)
                  setError('Please close this tab and relaunch from the extension.')
                  setIsLoading(false)
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Hint path: login form for full account. DEV shows editable username; PROD locks to hint email.
  const canSubmit = isDev
    ? !isLoading && devUsername.trim().length > 0 && password.length > 0
    : !isLoading && !!hint && password.length > 0

  return (
    <div className="auth-form-pane">
      <div className="auth-form-shell">
        <Form.Root onSubmit={handlePasswordSubmit} className="auth-form-card">
          <div className="auth-form-card__header">
            <div>
              <p className="auth-card__eyebrow">Extension Launch</p>
              <h2 className="auth-card__title">Sign in to continue</h2>
            </div>
            <div className="auth-form-card__badge">{isDev ? 'DEV' : 'Full account'}</div>
          </div>

          <p className="auth-form-card__copy">
            {isDev
              ? 'DEV mode — enter your local vtt-chat username to link as DM.'
              : 'Enter your password to launch into the campaign session.'}
          </p>

          {error && <div className="auth-alert">{error}</div>}

          {isDev ? (
            <Form.Field className="auth-field" name="username">
              <Form.Label htmlFor="ext-launch-username">Username</Form.Label>
              <Form.Control asChild>
                <input
                  id="ext-launch-username"
                  type="text"
                  value={devUsername}
                  onChange={(e) => setDevUsername(e.target.value)}
                  disabled={isLoading}
                  autoComplete="username"
                  placeholder="e.g. test"
                  required
                  autoFocus
                />
              </Form.Control>
            </Form.Field>
          ) : (
            <Form.Field className="auth-field" name="email">
              <Form.Label htmlFor="ext-launch-email">Email</Form.Label>
              <Form.Control asChild>
                <input
                  id="ext-launch-email"
                  type="email"
                  value={hint ?? ''}
                  disabled
                  readOnly
                  autoComplete="username"
                />
              </Form.Control>
            </Form.Field>
          )}

          <Form.Field className="auth-field" name="password">
            <Form.Label htmlFor="ext-launch-password">Password</Form.Label>
            <Form.Control asChild>
              <input
                id="ext-launch-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                autoFocus={!isDev}
              />
            </Form.Control>
          </Form.Field>

          <Form.Submit asChild>
            <button type="submit" disabled={!canSubmit} className="auth-submit">
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </Form.Submit>
        </Form.Root>
      </div>
    </div>
  )
}
