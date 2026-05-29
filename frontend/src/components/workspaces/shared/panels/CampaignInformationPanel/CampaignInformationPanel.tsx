import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { TooltipProvider } from '@/components/ui'
import { normalizeExtensionSyncPolicy } from '@/constants/sessionUi.normalizers'
import { useToast } from '@/hooks/useToast'
import type { CampaignInformationPanelProps } from '@/types/campaignInformationPanel'
import { CampaignInformationStatusLine } from './StatusLine'
import { CampaignInformationEditBody } from './EditBody'
import { CampaignInformationReadOnlyBody } from './ReadOnlyBody'
import { CampaignInformationHeader } from './Header'
import '@/styles/components/workspaces/shared/panels/CampaignInformationPanel.css'

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

  useEffect(() => {
    if (!campaign) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setNameDraft(campaign.name)
      setDescriptionDraft(campaign.description || '')
      setPosterUrlDraft(campaign.posterUrl || null)
      setIsEditing(Boolean(workspaceMode && canEdit))
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [campaign, workspaceMode, canEdit])

  if (!campaign) {
    return (
      <section className="cip-panel" aria-label="Campaign information">
        <h3 className="cip-heading">
          <Icon name="panel" />
          Campaign Information
        </h3>
        <p className="cip-muted">Select a campaign to view its metadata and activity summary.</p>
      </section>
    )
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
        integrationSyncPolicy: normalizeExtensionSyncPolicy(campaign.extensionSyncPolicy),
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

  const isDirty =
    nameDraft.trim() !== campaign.name ||
    descriptionDraft !== (campaign.description || '') ||
    (posterUrlDraft?.trim() || '') !== (campaign.posterUrl?.trim() || '')

  const currentPoster = isEditing ? posterUrlDraft : campaign.posterUrl
  const statusLine = (
    <CampaignInformationStatusLine
      campaign={campaign}
      sessionCount={sessionCount}
      totalSessionDurationMs={totalSessionDurationMs}
    />
  )

  return (
    <section
      className={`cip-panel ${workspaceMode ? 'cip-panel--workspace' : 'cip-panel--session'}`}
      aria-label="Campaign information"
    >
      <TooltipProvider delayDuration={140}>
        <CampaignInformationHeader
          canEdit={canEdit}
          isEditing={isEditing}
          isSaving={isSaving}
          isDirty={isDirty}
          nameDraft={nameDraft}
          onSave={() => {
            void handleSave()
          }}
          onCancel={handleCancel}
          onStartEditing={() => setIsEditing(true)}
        />

        <div className="cip-copy">
          {isEditing ? (
            <CampaignInformationEditBody
              nameDraft={nameDraft}
              descriptionDraft={descriptionDraft}
              isSaving={isSaving}
              onNameChange={setNameDraft}
              onDescriptionChange={setDescriptionDraft}
              currentPoster={currentPoster}
              campaignName={campaign.name}
              posterUrlDraft={posterUrlDraft}
              onClearPoster={() => setPosterUrlDraft(null)}
              onPosterUpload={handlePosterUpload}
              statusLine={statusLine}
            />
          ) : (
            <CampaignInformationReadOnlyBody
              campaignName={campaign.name}
              campaignDescription={campaign.description}
              currentPoster={currentPoster}
              statusLine={statusLine}
            />
          )}
        </div>
      </TooltipProvider>
    </section>
  )
}
