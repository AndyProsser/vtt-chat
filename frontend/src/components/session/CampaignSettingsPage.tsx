import { useEffect, useState } from 'react'
import type { UUID } from '@shared'
import { useToast } from '../../hooks/useToast'
import { Slider } from '../../core-ui'
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
  extensionSyncPolicy: 'NONE' | 'DM_ONLY' | 'DM_AND_PLAYERS'
  inviteCode: string
  inviteActive: boolean
  spectatorInviteCode?: string | null
  spectatorInviteActive: boolean
  postSessionChatEnabled: boolean
  postSessionChatDurationMs: number
}

export function CampaignSettingsPage(props: CampaignSettingsPageProps) {
  const showToast = useToast()
  const [settings, setSettings] = useState<CampaignSettingsPayload | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [postSessionChatEnabled, setPostSessionChatEnabled] = useState(true)
  const [postSessionChatDurationMinutes, setPostSessionChatDurationMinutes] = useState(5)
  const [extensionSyncPolicy, setExtensionSyncPolicy] = useState<'ALLOW' | 'DM_ONLY' | 'NONE'>(
    'ALLOW'
  )
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
        setPostSessionChatEnabled(payload.campaign.postSessionChatEnabled)
        setPostSessionChatDurationMinutes(
          Math.max(1, Math.min(15, Math.round(payload.campaign.postSessionChatDurationMs / 60000)))
        )
        setExtensionSyncPolicy(
          payload.campaign.extensionSyncPolicy === 'DM_AND_PLAYERS'
            ? 'ALLOW'
            : payload.campaign.extensionSyncPolicy
        )
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
          postSessionChatEnabled,
          postSessionChatDurationMs: postSessionChatEnabled
            ? postSessionChatDurationMinutes * 60_000
            : 300_000,
          extensionSyncPolicy,
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
      setPostSessionChatEnabled(payload.campaign.postSessionChatEnabled)
      setPostSessionChatDurationMinutes(
        Math.max(1, Math.min(15, Math.round(payload.campaign.postSessionChatDurationMs / 60000)))
      )
      setExtensionSyncPolicy(
        payload.campaign.extensionSyncPolicy === 'DM_AND_PLAYERS'
          ? 'ALLOW'
          : payload.campaign.extensionSyncPolicy
      )
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

              <h4 className="session-inline-form-title">Post-session chat</h4>
              <label className="session-label" htmlFor="post-session-chat-toggle">
                Enable spectator chat after ENDED
              </label>
              <div className="session-toggle-group" role="group" aria-label="Post-session chat">
                <button
                  type="button"
                  className={`session-toggle-button ${postSessionChatEnabled ? 'is-active' : ''}`}
                  aria-pressed={postSessionChatEnabled}
                  onClick={() => setPostSessionChatEnabled(true)}
                  disabled={isSaving}
                >
                  ON
                </button>
                <button
                  type="button"
                  className={`session-toggle-button ${!postSessionChatEnabled ? 'is-active' : ''}`}
                  aria-pressed={!postSessionChatEnabled}
                  onClick={() => setPostSessionChatEnabled(false)}
                  disabled={isSaving}
                >
                  OFF
                </button>
              </div>

              <label className="session-label" htmlFor="post-session-chat-duration">
                Duration: {postSessionChatDurationMinutes} min
              </label>
              <Slider
                id="post-session-chat-duration"
                className="session-slider"
                min={1}
                max={60}
                step={1}
                value={postSessionChatDurationMinutes}
                onValueChange={(nextValue) => setPostSessionChatDurationMinutes(nextValue)}
                disabled={isSaving || !postSessionChatEnabled}
              />
              <p className="session-card-subtitle">
                Default 5 minutes. Minimum 1 minute, maximum 60 minutes.
              </p>

              <h4 className="session-inline-form-title">Integrations</h4>
              <label className="session-label" htmlFor="campaign-extension-sync-policy">
                D&D Beyond / extension updates
              </label>
              <div
                id="campaign-extension-sync-policy"
                className="session-toggle-group"
                role="group"
                aria-label="Extension sync policy"
              >
                <button
                  type="button"
                  className={`session-toggle-button ${extensionSyncPolicy === 'ALLOW' ? 'is-active' : ''}`}
                  aria-pressed={extensionSyncPolicy === 'ALLOW'}
                  onClick={() => setExtensionSyncPolicy('ALLOW')}
                  disabled={isSaving}
                >
                  ALLOW
                </button>
                <button
                  type="button"
                  className={`session-toggle-button ${extensionSyncPolicy === 'DM_ONLY' ? 'is-active' : ''}`}
                  aria-pressed={extensionSyncPolicy === 'DM_ONLY'}
                  onClick={() => setExtensionSyncPolicy('DM_ONLY')}
                  disabled={isSaving}
                >
                  DM_ONLY
                </button>
                <button
                  type="button"
                  className={`session-toggle-button ${extensionSyncPolicy === 'NONE' ? 'is-active' : ''}`}
                  aria-pressed={extensionSyncPolicy === 'NONE'}
                  onClick={() => setExtensionSyncPolicy('NONE')}
                  disabled={isSaving}
                >
                  BLOCK
                </button>
              </div>
              <p className="session-card-subtitle">
                ALLOW permits DM and players to sync updates. DM_ONLY restricts updates to DM. BLOCK
                disables integration-driven updates.
              </p>
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
