import { Role } from '@shared'
import type { UUID } from '@shared'
import { useEffect, useMemo, useState } from 'react'
import { PolicyNotice } from './PolicyNotice'

type InviteCampaign = {
  id: string
  name: string
  dmDisplayName: string
}

type InviteValidationResult =
  | {
      valid: true
      type: 'player'
      campaign: InviteCampaign
      platformStatus: {
        online: boolean
        version: string
        activeUsers: number
        activeCampaigns: number
        activeSessions: number
      }
    }
  | {
      valid: false
      reason: string
    }

type PreflightResult = {
  accountStatus: 'none' | 'guest' | 'full'
  suggestedFlow: 'guest' | 'auto-login' | 'authenticate' | 'already-authenticated'
}

interface InviteJoinPageProps {
  apiUrl: string
  inviteCode: string
  authToken: string | null
  onAuthenticated?: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

type ExtensionGuestLoginResponse = {
  token: string
  user: {
    id: string
    role: 'DM' | 'PLAYER'
    authType: 'GUEST'
    displayName?: string
    username?: string
  }
}

type PolicyCode = 'INVITE_EXPIRED' | 'FULL_ACCOUNT_REQUIRED' | 'FULL_ACCOUNT_EXISTS' | null

const LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY = 'vtt-chat:lobby-campaign-focus-id'
const LOBBY_NOTICE_STORAGE_KEY = 'vtt-chat:lobby-notice'

export function InviteJoinPage({
  apiUrl,
  inviteCode,
  authToken,
  onAuthenticated,
}: InviteJoinPageProps) {
  const [loading, setLoading] = useState(true)
  const [validation, setValidation] = useState<InviteValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<PolicyCode>(null)
  const [joinMessage, setJoinMessage] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const [email, setEmail] = useState('')
  const [externalSystem, setExternalSystem] = useState('dndbeyond')
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [preflight, setPreflight] = useState<PreflightResult | null>(null)
  const [guestLoginLoading, setGuestLoginLoading] = useState(false)
  const [externalUserId, setExternalUserId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [externalCampaignId, setExternalCampaignId] = useState('')
  const [dmExternalUserId, setDmExternalUserId] = useState('')

  const validateInvite = async () => {
    setLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      const response = await fetch(
        `${apiUrl}/api/campaigns/invite/${encodeURIComponent(inviteCode)}/validate`
      )
      const data = await response.json()
      setValidation(data)
      if (!response.ok && data?.reason === 'INVITE_EXPIRED') {
        setErrorCode('INVITE_EXPIRED')
      }
    } catch {
      setError('Failed to validate invite code')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const runValidation = async () => {
      setLoading(true)
      setError(null)
      setErrorCode(null)
      try {
        const response = await fetch(
          `${apiUrl}/api/campaigns/invite/${encodeURIComponent(inviteCode)}/validate`
        )
        const data = await response.json()
        setValidation(data)
        if (!response.ok && data?.reason === 'INVITE_EXPIRED') {
          setErrorCode('INVITE_EXPIRED')
        }
      } catch {
        setError('Failed to validate invite code')
      } finally {
        setLoading(false)
      }
    }

    void runValidation()
  }, [apiUrl, inviteCode])

  const campaign = useMemo(() => {
    if (!validation || !validation.valid || validation.type !== 'player') {
      return null
    }
    return validation.campaign
  }, [validation])

  const continueToLobby = (campaignId: string, message: string) => {
    sessionStorage.setItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY, campaignId)
    sessionStorage.setItem(LOBBY_NOTICE_STORAGE_KEY, message)
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  const runPreflight = async () => {
    setPreflightLoading(true)
    setError(null)
    setErrorCode(null)
    setPreflight(null)
    try {
      const response = await fetch(`${apiUrl}/api/auth/extension/preflight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          email,
          externalSystem,
          inviteCode,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        if (data?.code === 'INVITE_EXPIRED') {
          setErrorCode('INVITE_EXPIRED')
        }
        throw new Error(data.message || 'Preflight failed')
      }

      setPreflight(data)
    } catch (preflightError) {
      const message = preflightError instanceof Error ? preflightError.message : 'Preflight failed'
      setError(message)
    } finally {
      setPreflightLoading(false)
    }
  }

  const joinCampaign = async () => {
    if (!campaign || !authToken) {
      return
    }

    setJoining(true)
    setError(null)
    setErrorCode(null)
    setJoinMessage(null)

    try {
      const response = await fetch(`${apiUrl}/api/campaigns/${campaign.id}/join`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteCode,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'Failed to join campaign')
      }

      continueToLobby(campaign.id, 'Campaign ready in your lobby. Continue when you are ready.')
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : 'Failed to join campaign'
      setError(message)
    } finally {
      setJoining(false)
    }
  }

  const shouldShowGuestLogin =
    preflight?.suggestedFlow === 'guest' || preflight?.suggestedFlow === 'auto-login'

  const handleSignInAndReturn = () => {
    sessionStorage.setItem('postLoginRedirectPath', `/join/${encodeURIComponent(inviteCode)}`)
    window.location.assign('/')
  }

  const handleExtensionGuestLogin = async () => {
    setGuestLoginLoading(true)
    setError(null)
    setErrorCode(null)

    try {
      const campaignPacket =
        externalCampaignId.trim() || dmExternalUserId.trim()
          ? {
              externalCampaignId: externalCampaignId.trim() || undefined,
              dmExternalUserId: dmExternalUserId.trim() || undefined,
            }
          : undefined

      const response = await fetch(`${apiUrl}/api/auth/extension/guest-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inviteCode,
          externalSystem,
          externalUserId,
          email,
          displayName: displayName.trim() || undefined,
          campaignPacket,
        }),
      })

      const data = (await response.json()) as ExtensionGuestLoginResponse & { message?: string }
      if (!response.ok) {
        if ((data as { code?: string }).code === 'FULL_ACCOUNT_EXISTS') {
          setErrorCode('FULL_ACCOUNT_EXISTS')
        }
        if ((data as { code?: string }).code === 'INVITE_EXPIRED') {
          setErrorCode('INVITE_EXPIRED')
        }
        throw new Error(data.message || 'Guest login failed')
      }

      const resolvedName =
        (typeof data.user.username === 'string' && data.user.username.trim()) ||
        (typeof data.user.displayName === 'string' && data.user.displayName.trim()) ||
        email.split('@')[0] ||
        'guest'

      onAuthenticated?.(data.token, {
        id: data.user.id as UUID,
        username: resolvedName,
        role: data.user.role as Role,
      })

      if (campaign) {
        continueToLobby(campaign.id, 'Campaign ready in your lobby. Continue when you are ready.')
        return
      }

      setJoinMessage('Extension guest login complete. You are now signed in.')
    } catch (guestLoginError) {
      const message =
        guestLoginError instanceof Error ? guestLoginError.message : 'Guest login failed'
      setError(message)
    } finally {
      setGuestLoginLoading(false)
    }
  }

  const renderPolicyNotice = () => {
    const effectiveCode: PolicyCode =
      errorCode || (!loading && validation && !validation.valid ? 'INVITE_EXPIRED' : null)

    if (!effectiveCode) {
      return null
    }

    if (effectiveCode === 'INVITE_EXPIRED') {
      return (
        <PolicyNotice
          title="Invite unavailable"
          tone="danger"
          actionLabel="Check Invite Again"
          onAction={() => {
            void validateInvite()
          }}
        >
          <p className="m-0">Ask the DM for a new player invite code, then try again.</p>
        </PolicyNotice>
      )
    }

    if (effectiveCode === 'FULL_ACCOUNT_EXISTS' || effectiveCode === 'FULL_ACCOUNT_REQUIRED') {
      return (
        <PolicyNotice
          title="Full account required"
          tone="warning"
          actionLabel="Sign In and Return"
          onAction={handleSignInAndReturn}
        >
          <p className="m-0">Sign in with your full account, then return to this invite.</p>
        </PolicyNotice>
      )
    }

    return null
  }

  const hasPolicyNotice = Boolean(
    errorCode ||
    (!loading && validation && !validation.valid && validation.reason === 'INVITE_EXPIRED')
  )

  return (
    <div className="mx-auto w-full max-w-3xl rounded-ui-lg border border-ui-border bg-ui-surface p-6">
      <h2 className="mt-0 text-2xl font-semibold">Player Invite</h2>
      <p className="text-sm text-ui-secondary">Invite code: {inviteCode}</p>

      {loading && <p>Validating invite...</p>}

      {renderPolicyNotice()}

      {campaign && (
        <section className="space-y-3">
          <div className="rounded-ui-sm border border-ui-border p-3">
            <p className="m-0 text-sm">
              <strong>Campaign:</strong> {campaign.name}
            </p>
            <p className="m-0 mt-1 text-sm">
              <strong>DM:</strong> {campaign.dmDisplayName}
            </p>
          </div>

          <div className="rounded-ui-sm border border-ui-border p-3">
            <h3 className="mt-0 text-base font-semibold">Continue from Extension</h3>
            <p className="text-sm text-ui-secondary">
              Use this when joining from the extension. Non-extension users can use standard join.
            </p>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className="block text-sm">
                <span className="mb-1 block">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                  placeholder="you@example.com"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block">External System</span>
                <input
                  type="text"
                  value={externalSystem}
                  onChange={(event) => setExternalSystem(event.target.value)}
                  className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                />
              </label>
              <button
                type="button"
                onClick={runPreflight}
                disabled={preflightLoading || !email.trim() || !externalSystem.trim()}
                className="rounded-ui-sm bg-ui-brand px-4 py-2 text-sm font-medium text-white hover:bg-ui-brand-hover disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {preflightLoading ? 'Checking...' : 'Run preflight'}
              </button>
            </div>
            {preflight && (
              <p className="mt-2 text-sm">
                accountStatus: <strong>{preflight.accountStatus}</strong>, suggestedFlow:{' '}
                <strong>{preflight.suggestedFlow}</strong>
              </p>
            )}

            {shouldShowGuestLogin && (
              <div className="mt-3 rounded-ui-sm border border-ui-border p-3">
                <h4 className="m-0 text-sm font-semibold">Continue with Guest Access</h4>
                <p className="mt-1 text-sm text-ui-secondary">
                  Continue with extension-backed guest auth to receive a platform session token.
                </p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block">External User ID</span>
                    <input
                      type="text"
                      value={externalUserId}
                      onChange={(event) => setExternalUserId(event.target.value)}
                      className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                      placeholder="ddb-user-123"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block">Display Name (optional)</span>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                      placeholder="Character or player name"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block">External Campaign ID (optional)</span>
                    <input
                      type="text"
                      value={externalCampaignId}
                      onChange={(event) => setExternalCampaignId(event.target.value)}
                      className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                      placeholder="ddb-campaign-123"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block">DM External User ID (optional)</span>
                    <input
                      type="text"
                      value={dmExternalUserId}
                      onChange={(event) => setDmExternalUserId(event.target.value)}
                      className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                      placeholder="ddb-dm-123"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={handleExtensionGuestLogin}
                  disabled={
                    guestLoginLoading ||
                    !email.trim() ||
                    !externalSystem.trim() ||
                    !externalUserId.trim()
                  }
                  className="mt-3 rounded-ui-sm bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {guestLoginLoading ? 'Continuing...' : 'Continue with Extension Guest Access'}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-ui-sm border border-ui-border p-3">
            <h3 className="mt-0 text-base font-semibold">Continue in the App</h3>
            <p className="text-sm text-ui-secondary">
              Already authenticated in the app? Continue directly into this campaign.
            </p>
            <button
              type="button"
              onClick={joinCampaign}
              disabled={!authToken || joining}
              className="rounded-ui-sm bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {joining ? 'Continuing...' : 'Continue to Campaign'}
            </button>
            {!authToken && (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-ui-secondary">
                  Log in from the app home page first if you are not using extension guest auth.
                </p>
                <button
                  type="button"
                  onClick={handleSignInAndReturn}
                  className="rounded-ui-sm border border-ui-border px-3 py-2 text-sm font-medium text-ui-primary hover:bg-ui-surface-muted"
                >
                  Sign In and Return to Invite
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {joinMessage && (
        <PolicyNotice title="Ready to continue" tone="success">
          <p className="m-0">{joinMessage}</p>
        </PolicyNotice>
      )}

      {error && !hasPolicyNotice && (
        <PolicyNotice title="Something went wrong" tone="danger">
          <p className="m-0">{error}</p>
        </PolicyNotice>
      )}
    </div>
  )
}
