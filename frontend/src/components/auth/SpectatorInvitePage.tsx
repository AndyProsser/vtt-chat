import { useEffect, useMemo, useState } from 'react'
import { Role } from '@shared'
import type { UUID } from '@shared'

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
        authType: 'GUEST'
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
  }
}

interface SpectatorInvitePageProps {
  apiUrl: string
  inviteCode: string
  onAuthenticated: (token: string, user: { id: UUID; username: string; role: Role }) => void
}

export function SpectatorInvitePage({
  apiUrl,
  inviteCode,
  onAuthenticated,
}: SpectatorInvitePageProps) {
  const [loading, setLoading] = useState(true)
  const [validation, setValidation] = useState<SpectatorInviteValidation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)

  const [waitlistToken, setWaitlistToken] = useState<string | null>(null)
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `${apiUrl}/api/campaigns/watch/${encodeURIComponent(inviteCode)}/validate`
        )
        const data = await response.json()
        setValidation(data)
      } catch {
        setError('Failed to validate spectator invite')
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [apiUrl, inviteCode])

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
            onAuthenticated(data.token, {
              id: data.user.id as UUID,
              username: data.user.username,
              role: Role.SPECTATOR,
            })
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

    try {
      const response = await fetch(`${apiUrl}/api/auth/spectator/guest-join`, {
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
        throw new Error(data.message || 'Failed to join as spectator')
      }

      if (data.joined) {
        onAuthenticated(data.token, {
          id: data.user.id as UUID,
          username: data.user.username,
          role: Role.SPECTATOR,
        })
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

  return (
    <div className="mx-auto w-full max-w-4xl rounded-ui-lg border border-ui-border bg-ui-surface p-6">
      <h2 className="mt-0 text-2xl font-semibold">Spectator Invite</h2>
      <p className="text-sm text-ui-secondary">Invite code: {inviteCode}</p>

      {loading && <p>Validating spectator invite...</p>}

      {!loading && validation && !validation.valid && (
        <div className="rounded-ui-sm border border-ui-error-text bg-ui-error-surface p-3 text-sm text-ui-error-text">
          Spectator invite is invalid or expired.
        </div>
      )}

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
            <div className="rounded-ui-sm border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
              You are on the waitlist.
              {typeof waitlistPosition === 'number'
                ? ` Current position: ${waitlistPosition}.`
                : ''}{' '}
              This page will auto-promote you when a slot opens.
            </div>
          ) : (
            <div className="rounded-ui-sm border border-ui-border p-3">
              <h3 className="mt-0 text-base font-semibold">Join as Guest Spectator</h3>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block">Display Name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    className="block w-full rounded-ui-sm border border-ui-border-soft px-3 py-2"
                    placeholder="Your display name"
                  />
                </label>
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
              </div>
              <button
                type="button"
                onClick={joinAsGuestSpectator}
                disabled={joinLoading || !displayName.trim() || !email.trim()}
                className="mt-3 rounded-ui-sm bg-ui-brand px-4 py-2 text-sm font-medium text-white hover:bg-ui-brand-hover disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {joinLoading ? 'Joining...' : 'Join Spectator Session'}
              </button>
            </div>
          )}
        </section>
      )}

      {error && (
        <div className="mt-3 rounded-ui-sm border border-ui-error-text bg-ui-error-surface p-3 text-sm text-ui-error-text">
          {error}
        </div>
      )}
    </div>
  )
}
