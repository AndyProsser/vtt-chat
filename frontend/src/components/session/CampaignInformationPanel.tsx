import { useEffect, useRef, useState } from 'react'
import type { UUID, SessionLifecycleState } from '@shared'
import '../../styles/components/session/CampaignInformationPanel.css'

type IntegrationSyncPolicy = 'ALLOW' | 'DM_ONLY' | 'NONE'

interface CampaignInformationPanelProps {
  campaign: {
    id: UUID
    name: string
    description?: string | null
    posterUrl?: string | null
    dmDisplayName?: string
    dmUsername?: string
    dmAvatarUrl?: string | null
    connectedPlayersRounded?: number
    connectedSpectatorsRounded?: number
    latestSessionState?: SessionLifecycleState | 'INACTIVE' | null
    extensionSyncPolicy?: 'NONE' | 'DM_ONLY' | 'DM_AND_PLAYERS'
  } | null
  sessionCount: number
  totalSessionDurationMs: number
  canEdit: boolean
  onEditCampaign: (campaignId: UUID) => void
  onSaveCampaignInfo: (
    campaignId: UUID,
    updates: {
      name: string
      description: string
      posterUrl: string | null
      integrationSyncPolicy: IntegrationSyncPolicy
    }
  ) => Promise<void>
}

function toUiIntegrationPolicy(
  value: 'NONE' | 'DM_ONLY' | 'DM_AND_PLAYERS' | undefined
): IntegrationSyncPolicy {
  if (value === 'NONE' || value === 'DM_ONLY') {
    return value
  }

  return 'ALLOW'
}

function integrationPolicyLabel(value: IntegrationSyncPolicy): string {
  if (value === 'DM_ONLY') {
    return 'DM only'
  }

  if (value === 'NONE') {
    return 'Blocked'
  }

  return 'Allowed'
}

function formatDuration(totalMs: number): string {
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return '0m'
  }

  const totalMinutes = Math.round(totalMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) {
    return `${minutes}m`
  }

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function formatSessionState(state?: SessionLifecycleState | 'INACTIVE' | null): string {
  if (!state) {
    return 'Unknown'
  }

  return state === 'INACTIVE' ? 'Idle' : state
}

export function CampaignInformationPanel({
  campaign,
  sessionCount,
  totalSessionDurationMs,
  canEdit,
  onEditCampaign,
  onSaveCampaignInfo,
}: CampaignInformationPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [posterUrlDraft, setPosterUrlDraft] = useState<string | null>(null)
  const [integrationSyncPolicyDraft, setIntegrationSyncPolicyDraft] =
    useState<IntegrationSyncPolicy>('ALLOW')
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!campaign) {
      return
    }

    setNameDraft(campaign.name)
    setDescriptionDraft(campaign.description || '')
    setPosterUrlDraft(campaign.posterUrl || null)
    setIntegrationSyncPolicyDraft(toUiIntegrationPolicy(campaign.extensionSyncPolicy))
    setIsEditing(false)
    setSaveError(null)
  }, [campaign])

  if (!campaign) {
    return (
      <section className="cip-panel" aria-label="Campaign information">
        <h3 className="cip-heading">Campaign Information</h3>
        <p className="cip-muted">Select a campaign to view its metadata and activity summary.</p>
      </section>
    )
  }

  const applyMarkdown = (mode: 'bold' | 'italic' | 'ul' | 'ol') => {
    const input = descriptionInputRef.current
    if (!input) {
      return
    }

    const start = input.selectionStart || 0
    const end = input.selectionEnd || 0
    const selected = descriptionDraft.slice(start, end)

    let next = descriptionDraft
    let replacement = selected

    if (mode === 'bold') {
      replacement = `**${selected || 'text'}**`
    } else if (mode === 'italic') {
      replacement = `*${selected || 'text'}*`
    } else if (mode === 'ul') {
      replacement = selected
        ? selected
            .split('\n')
            .map((line) => (line.trim().length ? `- ${line}` : '- '))
            .join('\n')
        : '- '
    } else {
      replacement = selected
        ? selected
            .split('\n')
            .map((line, index) => `${index + 1}. ${line || ''}`)
            .join('\n')
        : '1. '
    }

    next = `${descriptionDraft.slice(0, start)}${replacement}${descriptionDraft.slice(end)}`
    setDescriptionDraft(next)

    requestAnimationFrame(() => {
      const cursor = start + replacement.length
      input.focus()
      input.setSelectionRange(cursor, cursor)
    })
  }

  const handlePosterUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setSaveError('Poster must be an image file.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : null
      if (!value) {
        setSaveError('Unable to read poster image.')
        return
      }

      if (value.length > 2_000_000) {
        setSaveError('Poster image is too large. Please choose a smaller file.')
        return
      }

      setPosterUrlDraft(value)
    }
    reader.onerror = () => {
      setSaveError('Unable to read poster image.')
    }
    reader.readAsDataURL(file)
  }

  const handleCancel = () => {
    setNameDraft(campaign.name)
    setDescriptionDraft(campaign.description || '')
    setPosterUrlDraft(campaign.posterUrl || null)
    setIntegrationSyncPolicyDraft(toUiIntegrationPolicy(campaign.extensionSyncPolicy))
    setIsEditing(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!nameDraft.trim()) {
      setSaveError('Campaign name is required.')
      return
    }

    setSaveError(null)
    setIsSaving(true)

    try {
      await onSaveCampaignInfo(campaign.id, {
        name: nameDraft.trim(),
        description: descriptionDraft,
        posterUrl: posterUrlDraft?.trim() ? posterUrlDraft.trim() : null,
        integrationSyncPolicy: integrationSyncPolicyDraft,
      })
      setIsEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save campaign info.')
    } finally {
      setIsSaving(false)
    }
  }

  const displayName = campaign.dmDisplayName || campaign.dmUsername || 'DM'
  const dmInitial = displayName.charAt(0).toUpperCase()

  return (
    <section className="cip-panel" aria-label="Campaign information">
      <div className="cip-hero">
        <div className="cip-copy">
          <p className="cip-kicker">Campaign</p>
          {isEditing ? (
            <>
              <label className="cip-field-label" htmlFor="cip-name">
                Name
              </label>
              <input
                id="cip-name"
                className="cip-input"
                type="text"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                disabled={isSaving}
              />
              <label className="cip-field-label" htmlFor="cip-description">
                Description
              </label>
              <div className="cip-toolbar" role="toolbar" aria-label="Description formatting">
                <button
                  type="button"
                  className="cip-toolbar__button"
                  onClick={() => applyMarkdown('bold')}
                  disabled={isSaving}
                >
                  Bold
                </button>
                <button
                  type="button"
                  className="cip-toolbar__button"
                  onClick={() => applyMarkdown('italic')}
                  disabled={isSaving}
                >
                  Italic
                </button>
                <button
                  type="button"
                  className="cip-toolbar__button"
                  onClick={() => applyMarkdown('ul')}
                  disabled={isSaving}
                >
                  Bullet List
                </button>
                <button
                  type="button"
                  className="cip-toolbar__button"
                  onClick={() => applyMarkdown('ol')}
                  disabled={isSaving}
                >
                  Numbered List
                </button>
              </div>
              <textarea
                id="cip-description"
                ref={descriptionInputRef}
                className="cip-textarea"
                rows={4}
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                disabled={isSaving}
              />
            </>
          ) : (
            <>
              <h3 className="cip-heading">{campaign.name}</h3>
              <p className="cip-description">
                {campaign.description || 'No description provided.'}
              </p>
            </>
          )}
        </div>

        <div className="cip-poster" aria-hidden="true">
          {(isEditing ? posterUrlDraft : campaign.posterUrl) ? (
            <img
              className="cip-poster__image"
              src={(isEditing ? posterUrlDraft : campaign.posterUrl) || ''}
              alt=""
            />
          ) : (
            <div className="cip-poster__placeholder">{campaign.name.charAt(0).toUpperCase()}</div>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="cip-poster-controls">
          <label className="cip-field-label" htmlFor="cip-poster-file">
            Poster image
          </label>
          <input
            id="cip-poster-file"
            type="file"
            accept="image/*"
            onChange={handlePosterUpload}
            disabled={isSaving}
          />
          <label className="cip-field-label" htmlFor="cip-poster-url">
            Poster URL (optional)
          </label>
          <input
            id="cip-poster-url"
            className="cip-input"
            type="text"
            value={posterUrlDraft || ''}
            onChange={(event) => setPosterUrlDraft(event.target.value)}
            placeholder="https://..."
            disabled={isSaving}
          />
          <button
            type="button"
            className="session-button session-button-neutral"
            onClick={() => setPosterUrlDraft(null)}
            disabled={isSaving}
          >
            Remove poster
          </button>
        </div>
      ) : null}

      <div className="cip-stats" role="list" aria-label="Campaign stats">
        <div className="cip-stat" role="listitem">
          <span className="cip-stat__value">{sessionCount}</span>
          <span className="cip-stat__label" title="Total sessions created in this campaign.">
            Sessions <span className="cip-stat__hint">?</span>
          </span>
        </div>
        <div className="cip-stat" role="listitem">
          <span className="cip-stat__value">{formatDuration(totalSessionDurationMs)}</span>
          <span
            className="cip-stat__label"
            title="Sum of active session durations across this campaign."
          >
            Total length <span className="cip-stat__hint">?</span>
          </span>
        </div>
        <div className="cip-stat" role="listitem">
          <span className="cip-stat__value">{campaign.connectedPlayersRounded ?? 0}</span>
          <span className="cip-stat__label" title="Connected campaign players.">
            Players <span className="cip-stat__hint">?</span>
          </span>
        </div>
        <div className="cip-stat" role="listitem">
          <span className="cip-stat__value">{campaign.connectedSpectatorsRounded ?? 0}</span>
          <span className="cip-stat__label" title="Connected campaign spectators.">
            Spectators <span className="cip-stat__hint">?</span>
          </span>
        </div>
      </div>

      <div className="cip-meta">
        <div className="cip-meta__row">
          <span className="cip-meta__label">Integration updates</span>
          {isEditing ? (
            <div className="session-toggle-group" role="group" aria-label="Integration updates">
              <button
                type="button"
                className={`session-toggle-button ${integrationSyncPolicyDraft === 'ALLOW' ? 'is-active' : ''}`}
                aria-pressed={integrationSyncPolicyDraft === 'ALLOW'}
                onClick={() => setIntegrationSyncPolicyDraft('ALLOW')}
                disabled={isSaving}
              >
                ALLOW
              </button>
              <button
                type="button"
                className={`session-toggle-button ${integrationSyncPolicyDraft === 'DM_ONLY' ? 'is-active' : ''}`}
                aria-pressed={integrationSyncPolicyDraft === 'DM_ONLY'}
                onClick={() => setIntegrationSyncPolicyDraft('DM_ONLY')}
                disabled={isSaving}
              >
                DM_ONLY
              </button>
              <button
                type="button"
                className={`session-toggle-button ${integrationSyncPolicyDraft === 'NONE' ? 'is-active' : ''}`}
                aria-pressed={integrationSyncPolicyDraft === 'NONE'}
                onClick={() => setIntegrationSyncPolicyDraft('NONE')}
                disabled={isSaving}
              >
                BLOCK
              </button>
            </div>
          ) : (
            <span className="cip-meta__value">
              {integrationPolicyLabel(toUiIntegrationPolicy(campaign.extensionSyncPolicy))}
            </span>
          )}
        </div>
      </div>

      <div className="cip-meta">
        <div className="cip-meta__row">
          <span className="cip-meta__label">DM</span>
          <span className="cip-meta__value">
            {campaign.dmAvatarUrl ? (
              <img
                className="cip-dm-avatar"
                src={campaign.dmAvatarUrl}
                alt={`${displayName} avatar`}
              />
            ) : (
              <span className="cip-dm-avatar cip-dm-avatar--fallback">{dmInitial}</span>
            )}
            <span>{displayName}</span>
          </span>
        </div>
        <div className="cip-meta__row">
          <span className="cip-meta__label">Last session</span>
          <span className="cip-meta__value">{formatSessionState(campaign.latestSessionState)}</span>
        </div>
      </div>

      <div className="cip-actions">
        {canEdit && isEditing ? (
          <>
            <button
              type="button"
              className="session-button session-button-brand"
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              className="session-button session-button-neutral"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
          </>
        ) : canEdit ? (
          <button
            type="button"
            className="session-button session-button-brand"
            onClick={() => setIsEditing(true)}
          >
            Edit campaign info
          </button>
        ) : (
          <p className="cip-muted">Campaign metadata is read-only for your role.</p>
        )}

        {canEdit ? (
          <button
            type="button"
            className="session-button session-button-neutral"
            onClick={() => onEditCampaign(campaign.id)}
            disabled={isSaving}
          >
            Open full settings
          </button>
        ) : (
          ''
        )}
      </div>

      {saveError ? <p className="cip-error">{saveError}</p> : null}
    </section>
  )
}
