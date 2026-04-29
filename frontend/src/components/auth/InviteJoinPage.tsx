import { useEffect, useMemo, useState } from 'react'

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
}

export function InviteJoinPage({ apiUrl, inviteCode, authToken }: InviteJoinPageProps) {
  const [loading, setLoading] = useState(true)
  const [validation, setValidation] = useState<InviteValidationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joinMessage, setJoinMessage] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)

  const [email, setEmail] = useState('')
  const [externalSystem, setExternalSystem] = useState('dndbeyond')
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [preflight, setPreflight] = useState<PreflightResult | null>(null)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `${apiUrl}/api/campaigns/invite/${encodeURIComponent(inviteCode)}/validate`
        )
        const data = await response.json()
        setValidation(data)
      } catch {
        setError('Failed to validate invite code')
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [apiUrl, inviteCode])

  const campaign = useMemo(() => {
    if (!validation || !validation.valid || validation.type !== 'player') {
      return null
    }
    return validation.campaign
  }, [validation])

  const runPreflight = async () => {
    setPreflightLoading(true)
    setError(null)
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

      setJoinMessage('Campaign joined successfully. Return to the main app to open your session.')
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : 'Failed to join campaign'
      setError(message)
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl rounded-ui-lg border border-ui-border bg-ui-surface p-6">
      <h2 className="mt-0 text-2xl font-semibold">Player Invite</h2>
      <p className="text-sm text-ui-secondary">Invite code: {inviteCode}</p>

      {loading && <p>Validating invite...</p>}

      {!loading && validation && !validation.valid && (
        <div className="rounded-ui-sm border border-ui-error-text bg-ui-error-surface p-3 text-sm text-ui-error-text">
          This invite is invalid or expired.
        </div>
      )}

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
            <h3 className="mt-0 text-base font-semibold">Extension Preflight</h3>
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
          </div>

          <div className="rounded-ui-sm border border-ui-border p-3">
            <h3 className="mt-0 text-base font-semibold">Standard Join</h3>
            <p className="text-sm text-ui-secondary">
              Already authenticated in the app? Join this campaign directly.
            </p>
            <button
              type="button"
              onClick={joinCampaign}
              disabled={!authToken || joining}
              className="rounded-ui-sm bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {joining ? 'Joining...' : 'Join Campaign'}
            </button>
            {!authToken && (
              <p className="mt-2 text-sm text-ui-secondary">
                Log in from the app home page first if you are not using extension guest auth.
              </p>
            )}
          </div>
        </section>
      )}

      {joinMessage && (
        <div className="mt-3 rounded-ui-sm border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          {joinMessage}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-ui-sm border border-ui-error-text bg-ui-error-surface p-3 text-sm text-ui-error-text">
          {error}
        </div>
      )}
    </div>
  )
}
