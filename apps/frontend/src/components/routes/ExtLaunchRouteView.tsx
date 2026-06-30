/**
 * Extension Launch Route (/ext-launch)
 *
 * Two paths:
 *
 * TOKEN PATH — credential already issued (returning DM or player auto-login):
 *   URL: /ext-launch?campaignId=<uuid>&token=<jwt>&sessionId=<id>
 *   Validates token, redirects straight to campaign workspace.
 *
 * DM-LINK PATH — first-time DM link (no token):
 *   URL: /ext-launch?campaignId=<uuid>&hint=<ddb-email>&mode=dm-link
 *         &externalUserId=<ddb-uid>&externalCampaignId=<ddb-cid>
 *         &externalSystem=dndbeyond&deviceId=<uuid>[&campaignName=<name>]
 *
 *   After login this page runs the full DM link sequence:
 *     1. POST /api/auth/extension/dm-link   → claim DM status, get deviceCredential
 *     2. POST /api/integrations/external/dm-sync → update campaign name from DDB
 *     3. POST /api/campaigns/:id/session/ensure   → guarantee an IDLE session exists
 *     4. Signal extension via BroadcastChannel('vtt-chat-ext') + window.opener.postMessage
 *        (both sent; extension handles whichever arrives — see DEVICE-CREDENTIALS.md)
 *     5. Redirect to campaign workspace
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

interface DmLinkParams {
  externalUserId: string
  externalCampaignId: string
  externalSystem: string
  deviceId: string
  campaignName?: string
}

interface ExtLaunchRouteViewProps {
  apiUrl: string
  campaignId: string
  sessionId: string
  token?: string
  hint?: string
  mode?: 'dm-link'
  dmLinkParams?: DmLinkParams
  onFullAccountAuthenticated: (
    token: string,
    user: { id: UUID; username: string; role: Role }
  ) => void
  onGuestAuthenticated: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

type LinkStep = 'linking' | 'syncing' | 'ensuring-session' | 'done'

const STEP_LABELS: Record<LinkStep, string> = {
  linking: 'Linking your DM account…',
  syncing: 'Syncing campaign from D&D Beyond…',
  'ensuring-session': 'Preparing your session…',
  done: 'Launching campaign…',
}

export function ExtLaunchRouteView({
  apiUrl,
  campaignId,
  sessionId,
  token,
  hint,
  mode,
  dmLinkParams,
  onFullAccountAuthenticated,
  onGuestAuthenticated,
}: ExtLaunchRouteViewProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [linkStep, setLinkStep] = useState<LinkStep | null>(null)
  const [password, setPassword] = useState('')
  // DEV: editable username field; PROD: never rendered (hint is locked).
  const [devUsername, setDevUsername] = useState('')
  const tokenExchangedRef = useRef(false)

  const isDmLinkMode = mode === 'dm-link'

  // Mirrors the continueToCampaignSession pattern used by the player guest flow.
  // acceptedSessionId is the real session UUID from session/ensure; falls back to
  // the URL prop for the token path. Route to `/` so AppMainRouteView picks up the
  // LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY and calls handleEnterCampaign.
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

  /**
   * Runs the full DM link sequence after a successful login:
   *  1. dm-link  → claim DM status and get a deviceCredential
   *  2. dm-sync  → update campaign name from DDB (best-effort; non-fatal)
   *  3. session/ensure → guarantee an IDLE session exists
   *  4. postMessage    → extension stores the deviceCredential
   */
  const runDmLinkSequence = async (authToken: string): Promise<string | undefined> => {
    if (!dmLinkParams) return undefined

    const { externalUserId, externalCampaignId, externalSystem, deviceId, campaignName } =
      dmLinkParams

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    }

    // Step 1: dm-link
    setLinkStep('linking')
    const linkRes = await fetch(`${apiUrl}/api/auth/extension/dm-link`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        campaignId,
        externalSystem,
        externalUserId,
        externalCampaignId,
        email: hint ?? '',
        deviceId,
      }),
    })

    const linkData = await linkRes.json().catch(() => ({}))
    if (!linkRes.ok) {
      throw new Error(linkData.message || 'Failed to link DM account')
    }

    const deviceCredential: { credential: string; deviceId: string } | undefined =
      linkData.deviceCredential

    // Step 2: dm-sync (best-effort — update campaign name; non-fatal if it fails)
    setLinkStep('syncing')
    try {
      await fetch(`${apiUrl}/api/integrations/external/dm-sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          campaignId,
          externalSystem,
          externalCampaignId,
          campaignData: campaignName ? { name: campaignName } : undefined,
          characters: [],
        }),
      })
    } catch {
      // Non-fatal: name will sync on next full extension sync
    }

    // Step 3: session/ensure — capture the sessionId for the redirect
    setLinkStep('ensuring-session')
    const ensureRes = await fetch(`${apiUrl}/api/campaigns/${campaignId}/session/ensure`, {
      method: 'POST',
      headers,
    })
    const ensureData = await ensureRes.json().catch(() => ({}))
    const ensuredSessionId: string | undefined = ensureData.sessionId || undefined

    // Step 4: signal the extension that dm-link completed and deliver the deviceCredential.
    //
    // Two channels are used so the message arrives regardless of how the extension opened
    // this tab:
    //
    //  a) BroadcastChannel('vtt-chat-ext') — primary. Works when the tab was opened via
    //     chrome.tabs.create() (window.opener is null). The extension content script
    //     listens on this channel and relays the message to the background via
    //     chrome.runtime.sendMessage.
    //
    //  b) window.opener.postMessage — fallback. Works when the tab was opened via
    //     window.open() from the extension popup (window.opener is set).
    //
    // The extension must handle both; it will typically receive one or the other.
    setLinkStep('done')
    if (deviceCredential) {
      const payload = {
        type: 'VTT_CHAT_DM_LINK_COMPLETE',
        payload: {
          campaignId,
          deviceCredential,
          merged: linkData.merged ?? false,
        },
      }
      try {
        const channel = new BroadcastChannel('vtt-chat-ext')
        channel.postMessage(payload)
        channel.close()
      } catch {
        // BroadcastChannel not available in this context — fall through to opener
      }
      try {
        if (window.opener) {
          window.opener.postMessage(payload, window.location.origin)
        }
      } catch {
        // Non-fatal: extension will handle missing credential by re-prompting
      }
    }

    return ensuredSessionId
  }

  // Auto-authenticate when a token is provided in the URL (returning DM / player).
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

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    const loginIdentifier = isDev ? devUsername.trim() : hint
    if (!loginIdentifier) return

    setIsLoading(true)
    setError(null)

    try {
      // Step: login
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

      // Run the full DM link sequence if this is a dm-link launch.
      let ensuredSessionId: string | undefined
      if (isDmLinkMode && dmLinkParams) {
        ensuredSessionId = await runDmLinkSequence(authToken)
      }

      redirectToCampaign(ensuredSessionId)
      onFullAccountAuthenticated(authToken, user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLinkStep(null)
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

  // DM-link / hint path: show login form.
  const canSubmit = isDev
    ? !isLoading && devUsername.trim().length > 0 && password.length > 0
    : !isLoading && !!hint && password.length > 0

  const headingText = isDmLinkMode ? 'Log in to link your DM account' : 'Sign in to continue'

  const copyText = isDev
    ? 'DEV mode — enter your local vtt-chat username to link as DM.'
    : isDmLinkMode
      ? 'Log in with your vtt-chat account to link it to this D&D Beyond campaign.'
      : 'Enter your password to launch into the campaign session.'

  return (
    <div className="auth-form-pane">
      <div className="auth-form-shell">
        <Form.Root onSubmit={handlePasswordSubmit} className="auth-form-card">
          <div className="auth-form-card__header">
            <div>
              <p className="auth-card__eyebrow">Extension Launch</p>
              <h2 className="auth-card__title">{headingText}</h2>
            </div>
            <div className="auth-form-card__badge">
              {isDev ? 'DEV' : isDmLinkMode ? 'DM Link' : 'Full account'}
            </div>
          </div>

          <p className="auth-form-card__copy">{copyText}</p>

          {error && <div className="auth-alert">{error}</div>}

          {/* Linking progress overlay — shown after login while running the DM sequence */}
          {linkStep && <div className="auth-status-panel">{STEP_LABELS[linkStep]}</div>}

          {!linkStep && (
            <>
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
                  {isLoading ? 'Signing in…' : isDmLinkMode ? 'Link & Launch' : 'Sign in'}
                </button>
              </Form.Submit>
            </>
          )}
        </Form.Root>
      </div>
    </div>
  )
}
