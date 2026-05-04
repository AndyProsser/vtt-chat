import { useEffect, useState } from 'react'
import type { UUID } from '@shared'
import { useToast } from '../../hooks/useToast'
import '../../styles/components/session/SessionInit.css'

type CampaignSettingsPageProps = {
  apiUrl: string
  token: string
  campaignId: UUID
}

type CampaignSettingsPayload = {
  id: UUID
  name: string
  description?: string | null
  inviteCode: string
  inviteActive: boolean
  spectatorInviteCode?: string | null
  spectatorInviteActive: boolean
}

export function CampaignSettingsPage(props: CampaignSettingsPageProps) {
  const showToast = useToast()
  const [settings, setSettings] = useState<CampaignSettingsPayload | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isReissuingInvite, setIsReissuingInvite] = useState(false)

  useEffect(() => {
    if (!error) return

    showToast({
      id: `campaign-settings:error:${error}`,
      variant: 'error',
      message: error,
      onDismiss: () => {
        setError((current) => (current === error ? null : current))
      },
    })
  }, [error, showToast])

  useEffect(() => {
    if (!notice) return

    showToast({
      id: `campaign-settings:notice:${notice}`,
      variant: 'success',
      message: notice,
      onDismiss: () => {
        setNotice((current) => (current === notice ? null : current))
      },
    })
  }, [notice, showToast])

  useEffect(() => {
    const loadSettings = async () => {
      setError(null)
      setNotice(null)
      setIsLoading(true)

      try {
        const response = await fetch(`${props.apiUrl}/api/campaigns/${props.campaignId}/settings`, {
          headers: {
            Authorization: `Bearer ${props.token}`,
          },
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.message || 'Failed to load campaign settings')
        }

        const payload = (await response.json()) as { campaign: CampaignSettingsPayload }
        setSettings(payload.campaign)
        setName(payload.campaign.name)
        setDescription(payload.campaign.description || '')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        setIsLoading(false)
      }
    }

    void loadSettings()
  }, [props.apiUrl, props.campaignId, props.token])

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setIsSaving(true)

    try {
      const response = await fetch(`${props.apiUrl}/api/campaigns/${props.campaignId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${props.token}`,
        },
        body: JSON.stringify({
          name,
          description,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save campaign settings')
      }

      const payload = (await response.json()) as { campaign: CampaignSettingsPayload }
      setSettings(payload.campaign)
      setName(payload.campaign.name)
      setDescription(payload.campaign.description || '')
      setNotice('Campaign metadata saved.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReissueInvite = async (inviteType: 'PLAYER' | 'SPECTATOR') => {
    setError(null)
    setNotice(null)
    setIsReissuingInvite(true)

    try {
      const response = await fetch(
        `${props.apiUrl}/api/campaigns/${props.campaignId}/invites/reissue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${props.token}`,
          },
          body: JSON.stringify({ type: inviteType }),
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to reissue invite')
      }

      const settingsResponse = await fetch(
        `${props.apiUrl}/api/campaigns/${props.campaignId}/settings`,
        {
          headers: {
            Authorization: `Bearer ${props.token}`,
          },
        }
      )

      if (!settingsResponse.ok) {
        const payload = await settingsResponse.json().catch(() => ({}))
        throw new Error(payload.message || 'Invite reissued, but failed to refresh settings')
      }

      const payload = (await settingsResponse.json()) as { campaign: CampaignSettingsPayload }
      setSettings(payload.campaign)
      setNotice(
        inviteType === 'PLAYER'
          ? 'Player invite reissued. Old codes are invalid for new joins.'
          : 'Spectator invite reissued. Old codes are invalid for new joins.'
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setIsReissuingInvite(false)
    }
  }

  return (
    <div className="session-init-shell">
      <div className="session-card">
        <div className="session-campaign-settings-header">
          <div>
            <h3 className="session-card-title">Campaign Settings</h3>
            <p className="session-card-subtitle">
              Edit campaign metadata and rotate player/spectator invites.
            </p>
          </div>
          <button
            type="button"
            className="session-button session-button-neutral"
            onClick={() => {
              window.history.pushState({}, '', '/')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }}
          >
            Back to Campaigns
          </button>
        </div>

        {isLoading ? (
          <div className="session-status-message">Loading campaign settings...</div>
        ) : !settings ? (
          <div className="session-status-message">Unable to load this campaign.</div>
        ) : (
          <div className="session-campaign-settings-grid">
            <form className="session-campaign-settings-panel" onSubmit={handleSaveMetadata}>
              <h4 className="session-inline-form-title">Metadata</h4>
              <label className="session-label" htmlFor="campaign-name">
                Campaign name
              </label>
              <input
                id="campaign-name"
                className="session-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isSaving}
              />

              <label className="session-label" htmlFor="campaign-description">
                Description
              </label>
              <textarea
                id="campaign-description"
                className="session-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={isSaving}
              />

              <div className="session-action-row">
                <button
                  type="submit"
                  className="session-button session-button-brand"
                  disabled={isSaving || !name.trim()}
                >
                  {isSaving ? 'Saving...' : 'Save Metadata'}
                </button>
              </div>
            </form>

            <section className="session-campaign-settings-panel" aria-label="Invite controls">
              <h4 className="session-inline-form-title">Invites</h4>
              <p className="session-card-subtitle">Player invite code: {settings.inviteCode}</p>
              <p className="session-card-subtitle">
                Spectator invite code: {settings.spectatorInviteCode || 'Not issued'}
              </p>
              <div className="session-action-row">
                <button
                  type="button"
                  className="session-button session-button-brand"
                  onClick={() => void handleReissueInvite('PLAYER')}
                  disabled={isReissuingInvite}
                >
                  {isReissuingInvite ? 'Working...' : 'Reissue Player Invite'}
                </button>
                <button
                  type="button"
                  className="session-button session-button-indigo"
                  onClick={() => void handleReissueInvite('SPECTATOR')}
                  disabled={isReissuingInvite}
                >
                  {isReissuingInvite ? 'Working...' : 'Reissue Spectator Invite'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
