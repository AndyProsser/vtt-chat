import type { ChangeEvent, ReactNode } from 'react'
import type { SessionLifecycleState, UUID } from '@shared'
import type { ExtensionSyncPolicy, PersistedExtensionSyncPolicy } from '@/constants/sessionUi.types'

export type IntegrationSyncPolicy = ExtensionSyncPolicy

export type CampaignInformationPanelCampaign = {
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
  extensionSyncPolicy?: PersistedExtensionSyncPolicy
}

export type CampaignInformationPanelProps = {
  campaign: CampaignInformationPanelCampaign | null
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
      integrationSyncPolicy: ExtensionSyncPolicy
    }
  ) => Promise<void>
}

export type CampaignInformationHeaderProps = {
  canEdit: boolean
  isEditing: boolean
  isSaving: boolean
  isDirty: boolean
  nameDraft: string
  onSave: () => void
  onCancel: () => void
  onStartEditing: () => void
}

export type CampaignInformationEditBodyProps = {
  nameDraft: string
  descriptionDraft: string
  isSaving: boolean
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  currentPoster: string | null | undefined
  campaignName: string
  posterUrlDraft: string | null
  onClearPoster: () => void
  onPosterUpload: (event: ChangeEvent<HTMLInputElement>) => void
  statusLine: ReactNode
}

export type CampaignInformationReadOnlyBodyProps = {
  campaignName: string
  campaignDescription?: string | null
  currentPoster: string | null | undefined
  statusLine: ReactNode
}

export type CampaignInformationFooterActionsProps = {
  canEdit: boolean
  isEditing: boolean
}

export type CampaignInformationStatusLineProps = {
  campaign: Pick<
    CampaignInformationPanelCampaign,
    | 'name'
    | 'dmDisplayName'
    | 'dmUsername'
    | 'dmAvatarUrl'
    | 'dmOnline'
    | 'connectedPlayers'
    | 'connectedSpectators'
    | 'registeredPlayersCount'
    | 'connectedPlayersRounded'
    | 'connectedSpectatorsRounded'
    | 'updatedAt'
    | 'createdAt'
  >
  sessionCount: number
  totalSessionDurationMs: number
}
