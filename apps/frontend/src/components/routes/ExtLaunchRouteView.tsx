/**
 * Extension Launch Route (/ext-launch)
 *
 * Handles auth completion for extension-triggered launches. Two scenarios:
 *  - token param present: validate it via /api/auth/me, then redirect to campaign workspace
 *  - hint param present (no token): show password field for full-account login, then redirect
 *
 * Never shows invite-code entry — that belongs to the /join flow.
 * On auth success, sets postLoginRedirectPath so App.tsx navigates to the campaign.
 */

import { useEffect, useRef, useState } from 'react'
import * as Form from '@radix-ui/react-form'
import { Role } from '@shared'
import type { UUID } from '@shared'
import {
  ACTIVE_SESSION_CONTEXT_STORAGE_KEY,
} from '@/constants/workspaces.constants'
import '@/styles/components/routes/AuthSurface.css'

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
  const tokenExchangedRef = useRef(false)

  const redirectToCampaign = () => {
    if (!campaignId) return
    // Write the active session context so WorkspaceInitialization auto-enters the
    // correct campaign and session without showing the lobby first.
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
    if (!hint || !password) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: hint, password, accessMode: 'USER', role: Role.PLAYER }),
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
          {isLoading && (
            <div className="auth-status-panel">Connecting to your session&hellip;</div>
          )}
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
                  // Re-trigger the effect by forcing re-mount isn't possible here;
                  // instruct user to relaunch from the extension instead.
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

  // Hint path: show email pre-filled password form for full account login.
  return (
    <div className="auth-form-pane">
      <div className="auth-form-shell">
        <Form.Root onSubmit={handlePasswordSubmit} className="auth-form-card">
          <div className="auth-form-card__header">
            <div>
              <p className="auth-card__eyebrow">Extension Launch</p>
              <h2 className="auth-card__title">Sign in to continue</h2>
            </div>
            <div className="auth-form-card__badge">Full account</div>
          </div>

          <p className="auth-form-card__copy">
            Enter your password to launch into the campaign session.
          </p>

          {error && <div className="auth-alert">{error}</div>}

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
                autoFocus
              />
            </Form.Control>
          </Form.Field>

          <Form.Submit asChild>
            <button
              type="submit"
              disabled={isLoading || !password}
              className="auth-submit"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </Form.Submit>
        </Form.Root>
      </div>
    </div>
  )
}
