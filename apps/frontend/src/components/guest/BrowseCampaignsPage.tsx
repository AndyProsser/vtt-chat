import { useEffect, useState } from 'react'

type BrowseCampaign = {
  campaignId: string
  name: string
  dmDisplayName: string
  sessionActive: boolean
  spectatorPolicy: 'NONE' | 'GUESTS' | 'USERS'
  private: boolean
  spectatorSlotsFilled: number
  spectatorSlotsMax: number
  joinEnabled: boolean
}

interface BrowseCampaignsPageProps {
  apiUrl: string
  authToken: string | null
}

export function BrowseCampaignsPage({ apiUrl, authToken }: BrowseCampaignsPageProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<BrowseCampaign[]>([])

  useEffect(() => {
    if (!authToken) {
      return
    }

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${apiUrl}/api/campaigns/browse`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load campaigns')
        }
        setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : [])
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Failed to load campaigns'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [apiUrl, authToken])

  if (!authToken) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-ui-lg border border-ui-border bg-ui-surface p-6">
        <h2 className="mt-0 text-2xl font-semibold">Campaign Browse</h2>
        <p className="text-sm text-ui-secondary">
          Sign in with a full account to browse campaigns.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl rounded-ui-lg border border-ui-border bg-ui-surface p-6">
      <h2 className="mt-0 text-2xl font-semibold">Campaign Browse</h2>
      <p className="text-sm text-ui-secondary">
        Discover campaigns that allow spectator access. Private campaigns cannot be joined from this
        view.
      </p>

      {loading && <p>Loading campaigns...</p>}

      {error && (
        <div className="rounded-ui-sm border border-ui-error-text bg-ui-error-surface p-3 text-sm text-ui-error-text">
          {error}
        </div>
      )}

      {!loading && !error && (
        <ul className="m-0 mt-3 space-y-3 p-0">
          {campaigns.map((campaign) => (
            <li
              key={campaign.campaignId}
              className="list-none rounded-ui-sm border border-ui-border p-3"
            >
              <p className="m-0 text-base font-semibold">{campaign.name}</p>
              <p className="m-0 mt-1 text-sm text-ui-secondary">DM: {campaign.dmDisplayName}</p>
              <p className="m-0 mt-1 text-sm text-ui-secondary">
                Session: {campaign.sessionActive ? 'Active' : 'Inactive'} | Slots:{' '}
                {campaign.spectatorSlotsFilled}/{campaign.spectatorSlotsMax}
              </p>
              <p className="m-0 mt-1 text-sm">
                {campaign.private ? 'Private campaign' : 'Discoverable campaign'}
              </p>
              <button
                type="button"
                disabled={!campaign.joinEnabled}
                className="mt-2 rounded-ui-sm bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {campaign.joinEnabled ? 'Join from invite code' : 'Join unavailable'}
              </button>
            </li>
          ))}

          {campaigns.length === 0 && (
            <li className="list-none rounded-ui-sm border border-ui-border p-3 text-sm text-ui-secondary">
              No campaigns are currently discoverable.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
