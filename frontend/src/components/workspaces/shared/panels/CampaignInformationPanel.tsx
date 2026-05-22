import { useEffect, useRef, useState } from 'react'
import type { UUID, SessionLifecycleState } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import '@/styles/components/workspaces/shared/panels/CampaignInformationPanel.css'

type IntegrationSyncPolicy = 'ALLOW' | 'DM_ONLY' | 'NONE'

interface CampaignInformationPanelProps {
  campaign: {
    id: UUID
    name: string
    createdAt?: number | string
    updatedAt?: number | string
    description?: string | null
    posterUrl?: string | null
    dmDisplayName?: string
    dmUsername?: string
    dmAvatarUrl?: string | null
    dmOnline?: boolean
    connectedPlayers?: number
    connectedSpectators?: number
    registeredPlayersCount?: number
    connectedPlayersRounded?: number
    connectedSpectatorsRounded?: number
    latestSessionState?: SessionLifecycleState | null
    extensionSyncPolicy?: 'NONE' | 'DM_ONLY' | 'DM_AND_PLAYERS'
  } | null
  sessionCount: number
  totalSessionDurationMs: number
  canEdit: boolean
  workspaceMode?: boolean
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

function formatDmLastSeen(rawTimestamp?: number | string): string {
  if (rawTimestamp === undefined || rawTimestamp === null) {
    return 'Unknown'
  }

  const numeric =
    typeof rawTimestamp === 'number'
      ? rawTimestamp
      : Number.isFinite(Number(rawTimestamp))
        ? Number(rawTimestamp)
        : Date.parse(String(rawTimestamp))

  if (!Number.isFinite(numeric)) {
    return 'Unknown'
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(numeric))
  } catch {
    return 'Unknown'
  }
}

export function CampaignInformationPanel({
  campaign,
  sessionCount,
  totalSessionDurationMs,
  canEdit,
  workspaceMode = false,
  onSaveCampaignInfo,
}: CampaignInformationPanelProps) {
  const showToast = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [posterUrlDraft, setPosterUrlDraft] = useState<string | null>(null)
  const descriptionInputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!campaign) {
      return
    }

    setNameDraft(campaign.name)
    setDescriptionDraft(campaign.description || '')
    setPosterUrlDraft(campaign.posterUrl || null)
    setIsEditing(Boolean(workspaceMode && canEdit))
  }, [campaign, workspaceMode, canEdit])

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
      showToast({ variant: 'error', message: 'Poster must be an image file.' })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : null
      if (!value) {
        showToast({ variant: 'error', message: 'Unable to read poster image.' })
        return
      }

      if (value.length > 2_000_000) {
        showToast({
          variant: 'error',
          message: 'Poster image is too large. Please choose a smaller file.',
        })
        return
      }

      setPosterUrlDraft(value)
    }
    reader.onerror = () => {
      showToast({ variant: 'error', message: 'Unable to read poster image.' })
    }
    reader.readAsDataURL(file)
  }

  const handleCancel = () => {
    setNameDraft(campaign.name)
    setDescriptionDraft(campaign.description || '')
    setPosterUrlDraft(campaign.posterUrl || null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!nameDraft.trim()) {
      showToast({ variant: 'error', message: 'Campaign name is required.' })
      return
    }

    setIsSaving(true)

    try {
      await onSaveCampaignInfo(campaign.id, {
        name: nameDraft.trim(),
        description: descriptionDraft,
        posterUrl: posterUrlDraft?.trim() ? posterUrlDraft.trim() : null,
        integrationSyncPolicy: toUiIntegrationPolicy(campaign.extensionSyncPolicy),
      })
      setIsEditing(false)
    } catch (err) {
      showToast({
        variant: 'error',
        message: err instanceof Error ? err.message : 'Failed to save campaign information.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const displayName = campaign.dmDisplayName || campaign.dmUsername || 'DM'
  const dmInitial = displayName.charAt(0).toUpperCase()
  const dmStatusLabel = campaign.dmOnline ? 'Online' : 'Offline'
  const dmLastSeenLabel = formatDmLastSeen(campaign.updatedAt ?? campaign.createdAt)
  const onlinePlayers = campaign.connectedPlayers ?? campaign.connectedPlayersRounded ?? 0
  const registeredPlayers =
    campaign.registeredPlayersCount ?? campaign.connectedPlayersRounded ?? onlinePlayers
  const onlineSpectators = campaign.connectedSpectators ?? campaign.connectedSpectatorsRounded ?? 0
  const averageSessionDurationMs = sessionCount > 0 ? totalSessionDurationMs / sessionCount : 0
  const isDirty =
    nameDraft.trim() !== campaign.name ||
    descriptionDraft !== (campaign.description || '') ||
    (posterUrlDraft?.trim() || '') !== (campaign.posterUrl?.trim() || '')

  const currentPoster = isEditing ? posterUrlDraft : campaign.posterUrl
  const totalTimeLabel = formatDuration(totalSessionDurationMs)
  const averageSessionLabel = formatDuration(averageSessionDurationMs)

  const statusLine = (
    <div className="cip-status-line" role="list" aria-label="Campaign status summary">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="DM details">
            {campaign.dmAvatarUrl ? (
              <img
                className="cip-dm-avatar"
                src={campaign.dmAvatarUrl}
                alt={`${displayName} avatar`}
              />
            ) : (
              <span className="cip-dm-avatar cip-dm-avatar--fallback">{dmInitial}</span>
            )}
            <span className="cip-status-chip__text">DM: {displayName}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <div className="cip-dm-popper">
            <p className="cip-dm-popper__line">
              <span className="cip-dm-popper__label">Status</span>
              <span
                className={`cip-dm-popper__value ${campaign.dmOnline ? 'cip-dm-popper__value--online' : ''}`}
              >
                {dmStatusLabel}
              </span>
            </p>
            <p className="cip-dm-popper__line">
              <span className="cip-dm-popper__label">Last seen</span>
              <span className="cip-dm-popper__value">{dmLastSeenLabel}</span>
            </p>
          </div>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Sessions stat">
            <span className="material-symbols-outlined cip-status-chip__icon" aria-hidden="true">
              history
            </span>
            <span className="cip-status-chip__text">{sessionCount} Sessions</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Total sessions recorded for this campaign.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Total time stat">
            <span className="material-symbols-outlined cip-status-chip__icon" aria-hidden="true">
              schedule
            </span>
            <span className="cip-status-chip__text">{totalTimeLabel} Total played</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Average session: {averageSessionLabel}.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Players stat">
            <span className="material-symbols-outlined cip-status-chip__icon" aria-hidden="true">
              groups
            </span>
            <span className="cip-status-chip__text">
              {onlinePlayers}/{registeredPlayers} Players
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Online players / registered campaign players.</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cip-status-chip" aria-label="Spectators stat">
            <span className="material-symbols-outlined cip-status-chip__icon" aria-hidden="true">
              visibility
            </span>
            <span className="cip-status-chip__text">{onlineSpectators} Spectators</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Spectators online right now.</TooltipContent>
      </Tooltip>
    </div>
  )

  return (
    <section
      className={`cip-panel ${workspaceMode ? 'cip-panel--workspace' : 'cip-panel--session'}`}
      aria-label="Campaign information"
    >
      <TooltipProvider delayDuration={140}>
        <div className="cip-header-row">
          <h3 className="cip-heading">Campaign Information</h3>
          {canEdit && isEditing ? (
            <div className="cip-inline-actions" aria-label="Campaign information actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action session-icon-action--icon"
                    aria-label={
                      isSaving ? 'Saving campaign information' : 'Save campaign information'
                    }
                    onClick={() => void handleSave()}
                    disabled={isSaving || !isDirty || !nameDraft.trim()}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {isSaving ? 'hourglass_top' : 'save'}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Save changes</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action session-icon-action--icon"
                    aria-label="Undo campaign edits"
                    onClick={handleCancel}
                    disabled={isSaving || !isDirty}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      undo
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Undo unsaved edits</TooltipContent>
              </Tooltip>
            </div>
          ) : null}
        </div>

        <div className="cip-copy">
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="cip-toolbar__button"
                      onClick={() => applyMarkdown('bold')}
                      disabled={isSaving}
                      aria-label="Bold"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        format_bold
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Bold</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="cip-toolbar__button"
                      onClick={() => applyMarkdown('italic')}
                      disabled={isSaving}
                      aria-label="Italic"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        format_italic
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Italic</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="cip-toolbar__button"
                      onClick={() => applyMarkdown('ul')}
                      disabled={isSaving}
                      aria-label="Bullet list"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        format_list_bulleted
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Bullet list</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="cip-toolbar__button"
                      onClick={() => applyMarkdown('ol')}
                      disabled={isSaving}
                      aria-label="Numbered list"
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        format_list_numbered
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Numbered list</TooltipContent>
                </Tooltip>
              </div>
              <textarea
                id="cip-description"
                ref={descriptionInputRef}
                className="cip-textarea"
                rows={7}
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                disabled={isSaving}
              />

              {statusLine}

              <div className="cip-poster-controls">
                <label className="cip-field-label" htmlFor="cip-poster-file">
                  Poster image
                </label>
                <div
                  className={`cip-poster-surface cip-poster-surface--editable ${currentPoster ? 'has-image' : ''}`}
                  style={currentPoster ? { backgroundImage: `url(${currentPoster})` } : undefined}
                  aria-label="Poster preview"
                >
                  {!currentPoster ? (
                    <div className="cip-poster__placeholder">
                      {campaign.name.charAt(0).toUpperCase()}
                    </div>
                  ) : null}
                  <div className="cip-poster-overlay" aria-hidden="true">
                    {posterUrlDraft ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="cip-poster-clear"
                            aria-label="Clear poster image"
                            onClick={() => setPosterUrlDraft(null)}
                            disabled={isSaving}
                          >
                            <span className="material-symbols-outlined" aria-hidden="true">
                              close
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Remove poster image</TooltipContent>
                      </Tooltip>
                    ) : null}
                    <label
                      htmlFor="cip-poster-file"
                      className="session-button session-button-neutral cip-browse-button"
                    >
                      Browse...
                    </label>
                  </div>
                  <input
                    id="cip-poster-file"
                    type="file"
                    accept="image/*"
                    onChange={handlePosterUpload}
                    disabled={isSaving}
                    className="cip-visually-hidden"
                  />
                </div>
                <p className="cip-muted">External poster sync stores a local copy.</p>
              </div>
            </>
          ) : (
            <>
              <p className="cip-kicker">Campaign</p>
              <p className="cip-name-value">{campaign.name}</p>
              <p className="cip-description">
                {campaign.description || 'No description provided.'}
              </p>

              {statusLine}

              <div className="cip-poster-controls">
                <span className="cip-field-label">Poster image</span>
                <div
                  className={`cip-poster-surface ${currentPoster ? 'has-image' : ''}`}
                  style={currentPoster ? { backgroundImage: `url(${currentPoster})` } : undefined}
                  aria-hidden="true"
                >
                  {!currentPoster ? (
                    <div className="cip-poster__placeholder">
                      {campaign.name.charAt(0).toUpperCase()}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="cip-actions">
          {!workspaceMode && canEdit && !isEditing ? (
            <button
              type="button"
              className="session-button session-button-brand"
              onClick={() => setIsEditing(true)}
            >
              Edit campaign information
            </button>
          ) : !canEdit ? (
            <p className="cip-muted">Campaign metadata is read-only for your role.</p>
          ) : (
            ''
          )}
        </div>
      </TooltipProvider>
    </section>
  )
}
