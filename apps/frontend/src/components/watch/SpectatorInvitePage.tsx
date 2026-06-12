import { useCallback, useEffect, useMemo, useState } from 'react'
import * as Form from '@radix-ui/react-form'
import { Role } from '@shared'
import type { UUID } from '@shared'
import { PolicyNotice } from '@/components/auth/PolicyNotice'

type SpectatorCampaignInfo = {
  id: string
  name: string
  dmDisplayName: string
  sessionActive: boolean
  spectatorSlotsFilled: number
  spectatorSlotsMax: number
  spectatorWaitlistEnabled: boolean
  spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
}

type SpectatorInviteValidation =
  | {
      valid: true
      type: 'spectator'
      campaign: SpectatorCampaignInfo
      characters: Array<{
        name: string
        class: string | null
        level: number | null
        avatarUrl: string | null
        online: boolean
      }>
    }
  | {
      valid: false
      reason: string
    }

type SpectatorJoinResult =
  | {
      joined: true
      token: string
      user: {
        id: string
        username: string
        role: 'SPECTATOR'
        authType: 'GUEST' | 'FULL'
      }
      campaignId: string
    }
  | {
      joined: false
      waitlist: {
        enabled: true
        waitlistToken: string
        position: number
      }
      campaignId: string
    }

type WaitlistStatus = {
  status: 'WAITLISTED' | 'PROMOTED' | 'NOT_FOUND'
  position?: number
  token?: string
  user?: {
    id: string
    username: string
    role: 'SPECTATOR'
    authType: 'GUEST' | 'FULL'
  }
}

type PolicyCode =
  | 'INVITE_EXPIRED'
  | 'FULL_ACCOUNT_REQUIRED'
  | 'SPECTATOR_CAPACITY_REACHED'
  | 'SESSION_INACTIVE'
  | null

interface SpectatorInvitePageProps {
  apiUrl: string
  inviteCode: string
  authToken: string | null
  authType: 'GUEST' | 'FULL' | null
  onAuthenticated: (
    token: string,
    user: { id: UUID; username: string; role: Role },
    authType: 'GUEST' | 'FULL'
  ) => void
}

export function SpectatorInvitePage({
  apiUrl,
  inviteCode,
  authToken,
  authType,
  onAuthenticated,
}: SpectatorInvitePageProps) {
  const [loading, setLoading] = useState(true)
  const [validation, setValidation] = useState<SpectatorInviteValidation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<PolicyCode>(null)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)

  const [waitlistToken, setWaitlistToken] = useState<string | null>(null)
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null)

  const validateInvite = useCallback(async () => {
    setLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      const response = await fetch(
        `${apiUrl}/api/campaigns/watch/${encodeURIComponent(inviteCode)}/validate`
      )
      const data = await response.json()
      setValidation(data)
      if (!response.ok && data?.reason === 'INVITE_EXPIRED') {
        setErrorCode('INVITE_EXPIRED')
      }
    } catch {
      setError('Failed to validate spectator invite')
    } finally {
      setLoading(false)
    }
  }, [apiUrl, inviteCode])

  // Defer invite validation kickoff to avoid synchronous state updates in effect body.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void validateInvite()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [validateInvite])

  const campaign = useMemo(() => {
    if (!validation || !validation.valid || validation.type !== 'spectator') {
      return null
    }
    return validation.campaign
  }, [validation])

  useEffect(() => {
    if (!waitlistToken || !campaign) {
      return
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(
            `${apiUrl}/api/campaigns/${campaign.id}/spectator/waitlist-status?waitlistToken=${encodeURIComponent(waitlistToken)}`
          )
          const data = (await response.json()) as WaitlistStatus

          if (data.status === 'PROMOTED' && data.token && data.user) {
            onAuthenticated(
              data.token,
              {
                id: data.user.id as UUID,
                username: data.user.username,
                role: Role.SPECTATOR,
              },
              data.user.authType || 'GUEST'
            )
            setWaitlistToken(null)
            setWaitlistPosition(null)
            return
          }

          if (data.status === 'WAITLISTED') {
            setWaitlistPosition(typeof data.position === 'number' ? data.position : null)
            return
          }

          if (data.status === 'NOT_FOUND') {
            setError('Waitlist entry no longer exists. Please retry joining.')
            setWaitlistToken(null)
            setWaitlistPosition(null)
          }
        } catch {
          setError('Failed to refresh waitlist status')
        }
      })()
    }, 7000)

    return () => window.clearInterval(intervalId)
  }, [apiUrl, campaign, onAuthenticated, waitlistToken])

  const joinAsGuestSpectator = async () => {
    setJoinLoading(true)
    setError(null)
    setErrorCode(null)

    try {
      const response = await fetch(`${apiUrl}/api/auth/join/guest/spectator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          spectatorInviteCode: inviteCode,
          email,
          displayName,
        }),
      })

      const data = (await response.json()) as SpectatorJoinResult & { message?: string }
      if (!response.ok) {
        const code = (data as { code?: string }).code
        if (code === 'FULL_ACCOUNT_REQUIRED') setErrorCode('FULL_ACCOUNT_REQUIRED')
        if (code === 'SPECTATOR_CAPACITY_REACHED') setErrorCode('SPECTATOR_CAPACITY_REACHED')
        if (code === 'SESSION_INACTIVE') setErrorCode('SESSION_INACTIVE')
        if (code === 'INVITE_EXPIRED') setErrorCode('INVITE_EXPIRED')
        throw new Error(data.message || 'Failed to join as spectator')
      }

      if (data.joined) {
        onAuthenticated(
          data.token,
          {
            id: data.user.id as UUID,
            username: data.user.username,
            role: Role.SPECTATOR,
          },
          data.user.authType || 'GUEST'
        )
        return
      }

      setWaitlistToken(data.waitlist.waitlistToken)
      setWaitlistPosition(data.waitlist.position)
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : 'Failed to join spectator'
      setError(message)
    } finally {
      setJoinLoading(false)
    }
  }

  const joinAsAuthenticatedSpectator = async () => {
    if (!authToken) {
      return
    }

    setJoinLoading(true)
    setError(null)
    setErrorCode(null)

    try {
      const response = await fetch(
        `${apiUrl}/api/campaigns/watch/${encodeURIComponent(inviteCode)}/join`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      )

      const data = (await response.json()) as SpectatorJoinResult & { message?: string }
      if (!response.ok) {
        const code = (data as { code?: string }).code
        if (code === 'FULL_ACCOUNT_REQUIRED') setErrorCode('FULL_ACCOUNT_REQUIRED')
        if (code === 'SPECTATOR_CAPACITY_REACHED') setErrorCode('SPECTATOR_CAPACITY_REACHED')
        if (code === 'SESSION_INACTIVE') setErrorCode('SESSION_INACTIVE')
        if (code === 'INVITE_EXPIRED') setErrorCode('INVITE_EXPIRED')
        throw new Error(data.message || 'Failed to join as spectator')
      }

      if (data.joined) {
        onAuthenticated(
          data.token,
          {
            id: data.user.id as UUID,
            username: data.user.username,
            role: Role.SPECTATOR,
          },
          data.user.authType || 'FULL'
        )
        return
      }

      setWaitlistToken(data.waitlist.waitlistToken)
      setWaitlistPosition(data.waitlist.position)
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : 'Failed to join spectator'
      setError(message)
    } finally {
      setJoinLoading(false)
    }
  }

  const isFullAccountAuthenticated = Boolean(authToken && authType === 'FULL')
  const requiresFullAccount = campaign?.spectatorPolicy === 'USERS'
  const isSessionInactive = campaign?.sessionActive === false

  const handleSignInAndReturn = () => {
    sessionStorage.setItem('postLoginRedirectPath', `/watch/${encodeURIComponent(inviteCode)}`)
    window.location.assign('/')
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
          <p className="m-0">Ask the DM for a new spectator invite, then try again.</p>
        </PolicyNotice>
      )
    }

    if (effectiveCode === 'FULL_ACCOUNT_REQUIRED') {
      return (
        <PolicyNotice
          title="Full account required"
          tone="warning"
          actionLabel="Sign In and Return"
          onAction={handleSignInAndReturn}
        >
          <p className="m-0">Sign in with your full account, then return to this watch link.</p>
        </PolicyNotice>
      )
    }

    if (effectiveCode === 'SPECTATOR_CAPACITY_REACHED') {
      return (
        <PolicyNotice
          title="Capacity reached"
          tone="warning"
          actionLabel="Refresh Status"
          onAction={() => {
            void validateInvite()
          }}
        >
          <p className="m-0">
            All spectator slots are full. Wait for an opening or ask the DM to enable the waitlist.
          </p>
        </PolicyNotice>
      )
    }

    if (effectiveCode === 'SESSION_INACTIVE') {
      return (
        <PolicyNotice
          title="Session not active"
          tone="info"
          actionLabel="Refresh Status"
          onAction={() => {
            void validateInvite()
          }}
        >
          <p className="m-0">Wait for the DM to start the session, then check again.</p>
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
    <div className="mx-auto w-full max-w-4xl rounded-ui-lg border border-ui-border bg-ui-surface p-6">
      <h2 className="mt-0 text-2xl font-semibold">Spectator Invite</h2>
      <p className="text-sm text-ui-secondary">Invite code: {inviteCode}</p>

      {loading && <p>Validating spectator invite...</p>}

      {renderPolicyNotice()}

      {campaign && (
        <section className="space-y-4">
          <div className="rounded-ui-sm border border-ui-border p-3 text-sm">
            <p className="m-0">
              <strong>Campaign:</strong> {campaign.name}
            </p>
            <p className="m-0 mt-1">
              <strong>DM:</strong> {campaign.dmDisplayName}
            </p>
            <p className="m-0 mt-1">
              <strong>Session:</strong> {campaign.sessionActive ? 'Active' : 'Inactive'}
            </p>
            <p className="m-0 mt-1">
              <strong>Slots:</strong> {campaign.spectatorSlotsFilled}/{campaign.spectatorSlotsMax}
            </p>
          </div>

          <div className="rounded-ui-sm border border-ui-border p-3 text-sm">
            <h3 className="mt-0 text-base font-semibold">Current Character Roster</h3>
            <ul className="m-0 list-disc pl-5">
              {validation?.valid &&
              validation.type === 'spectator' &&
              validation.characters.length > 0 ? (
                validation.characters.map((character) => (
                  <li key={`${character.name}-${character.class || 'unknown'}`}>
                    {character.name}
                    {character.class ? ` (${character.class}` : ''}
                    {typeof character.level === 'number' ? ` ${character.level}` : ''}
                    {character.class ? ')' : ''} - {character.online ? 'Online' : 'Offline'}
                  </li>
                ))
              ) : (
                <li>No characters available yet.</li>
              )}
            </ul>
          </div>

          {waitlistToken ? (
            <PolicyNotice title="On the waitlist" tone="info">
              <p className="m-0">
                You will be promoted automatically when a slot opens.
                {typeof waitlistPosition === 'number'
                  ? ` Current position: ${waitlistPosition}.`
                  : ''}
              </p>
            </PolicyNotice>
          ) : (
            <div className="rounded-ui-sm border border-ui-border p-3">
              <h3 className="mt-0 text-base font-semibold">Continue to Spectator Session</h3>

              {isSessionInactive ? (
                <PolicyNotice title="Session not active" tone="info">
                  <p className="m-0">
                    Wait for the DM to start the session, then refresh this page.
                  </p>
                </PolicyNotice>
              ) : isFullAccountAuthenticated ? (
                <>
                  <p className="text-sm text-ui-secondary">
                    Continue into spectator access with your full account.
                  </p>
                  <button
                    type="button"
                    onClick={joinAsAuthenticatedSpectator}
                    disabled={joinLoading}
                    className="mt-3 rounded-ui-sm bg-ui-brand px-4 py-2 text-sm font-medium text-white hover:bg-ui-brand-hover disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {joinLoading ? 'Continuing...' : 'Continue with Full Account'}
                  </button>
                </>
              ) : requiresFullAccount ? (
                <>
                  <PolicyNotice
                    title="Full account required"
                    tone="warning"
                    actionLabel="Sign In and Return"
                    onAction={handleSignInAndReturn}
                  >
                    <p className="m-0">
                      Sign in with your full account, then return to this watch link.
                    </p>
                  </PolicyNotice>
                </>
              ) : (
                <>
                  <p className="text-sm text-ui-secondary">
                    Continue instantly as a temporary guest spectator, or sign in with a full
                    account.
                  </p>
                  <Form.Root className="grid gap-2 md:grid-cols-2">
                    <Form.Field className="block text-sm" name="displayName">
                      <Form.Label className="mb-1 block">Display Name</Form.Label>
                      <Form.Control asChild>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(event) => setDisplayName(event.target.value)}
                          className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                          placeholder="Your display name"
                        />
                      </Form.Control>
                    </Form.Field>
                    <Form.Field className="block text-sm" name="email">
                      <Form.Label className="mb-1 block">Email</Form.Label>
                      <Form.Control asChild>
                        <input
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                          placeholder="you@example.com"
                        />
                      </Form.Control>
                    </Form.Field>
                  </Form.Root>
                  <button
                    type="button"
                    onClick={joinAsGuestSpectator}
                    disabled={joinLoading || !displayName.trim() || !email.trim()}
                    className="mt-3 rounded-ui-sm bg-ui-brand px-4 py-2 text-sm font-medium text-white hover:bg-ui-brand-hover disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {joinLoading ? 'Continuing...' : 'Continue as Guest Spectator'}
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {error && !hasPolicyNotice && (
        <PolicyNotice title="Something went wrong" tone="danger">
          <p className="m-0">{error}</p>
        </PolicyNotice>
      )}
    </div>
  )
}
