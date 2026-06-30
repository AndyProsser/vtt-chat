/**
 * Extension Launch Route (/ext-launch)
 *
 * Two paths:
 *
 * TOKEN PATH — credential already issued (returning DM or player, or first-time DM after
 *   dm-link-init completes in the extension):
 *   URL: /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
 *   Validates token, redirects straight to campaign workspace. No form shown.
 *
 * HINT PATH — fallback re-auth (extension sends hint but no token):
 *   URL: /ext-launch?campaignId=<uuid>&hint=<email>
 *   Shows a login form with email pre-filled. On success navigates to campaign.
 *   This path does NOT run the DM link sequence — the extension must call
 *   POST /api/auth/extension/dm-link-init before opening this tab.
 *
 * First-time DM link no longer uses a browser tab for auth. The extension calls
 * POST /api/auth/extension/dm-link-init directly, receives { token, deviceCredential,
 * sessionId }, stores the credential, then opens the token path above.
 * See docs/extension/DM-LINK.md §4.
 *
 * DEV mode (import.meta.env.DEV):
 *   The username field is editable so the developer can type their local vtt-chat username
 *   (e.g. "test") instead of the locked DDB email. DEV passwordless mode rejects email-format
 *   logins, and the same DDB identity is often used for both DM and player testing.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Form from '@radix-ui/react-form'
import { Role } from '@shared'
import type { UUID } from '@shared'
import {
  ACTIVE_SESSION_CONTEXT_STORAGE_KEY,
  LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY,
  LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY,
} from '@/constants/workspaces.constants'
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
  // DEV: editable username field; PROD: never rendered (hint is locked).
  const [devUsername, setDevUsername] = useState('')
  const tokenExchangedRef = useRef(false)

  // Mirrors the continueToCampaignSession pattern used by the player guest flow.
  // acceptedSessionId is the real session UUID from session/ensure; falls back to
  // the URL prop for the token path.
  const redirectToCampaign = useCallback(
    (acceptedSessionId?: string) => {
      if (!campaignId) return
      const resolvedSessionId = acceptedSessionId || sessionId
      if (resolvedSessionId) {
        sessionStorage.setItem(
          ACTIVE_SESSION_CONTEXT_STORAGE_KEY,
          JSON.stringify({ campaignId, sessionId: resolvedSessionId })
        )
      }
      sessionStorage.setItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY, campaignId)
      sessionStorage.setItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY, campaignId)
      sessionStorage.setItem('postLoginRedirectPath', '/')
    },
    [campaignId, sessionId]
  )

  // Auto-authenticate when a token is provided in the URL (returning DM / player,
  // or first-time DM after dm-link-init completes in the extension).
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
  }, [token, apiUrl, onFullAccountAuthenticated, onGuestAuthenticated, redirectToCampaign])

  // Hint path: plain login form — no DM link sequence. The extension must complete
  // dm-link-init before opening this tab. This form is a fallback re-auth only.
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    const loginIdentifier = isDev ? devUsername.trim() : hint
    if (!loginIdentifier) return

    setIsLoading(true)
    setError(null)

    try {
      const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginIdentifier,
          password,
          accessMode: 'USER',
          role: Role.PLAYER,
        }),
      })

      const loginData = await loginRes.json().catch(() => ({}))
      if (!loginRes.ok) throw new Error(loginData.message || 'Login failed')

      const authToken: string = loginData.token
      const user = {
        id: loginData.user.id as UUID,
        username: String(loginData.user.username || loginData.user.displayName || 'user'),
        role: (loginData.user.role as Role) || Role.PLAYER,
      }

      redirectToCampaign()
      onFullAccountAuthenticated(authToken, user)
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

  // Token path: auto-authenticating (returning DM or player).
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
                  setError('Please close this tab and relaunch from the extension.')
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

  // Hint / fallback path: re-auth form with pre-filled email.
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
              ? 'DEV mode — enter your local vtt-chat username to continue.'
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
