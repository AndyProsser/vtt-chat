import { type Role, type SessionState, type UUID } from '@shared'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import type { CampaignSettingsPayload, CampaignSummary } from '@/types/session/campaign'
import type { Session } from '@/types/session'
import type { EditorWorkspaceView } from '@/types/workspaces'

export type EditorWorkspaceProps = {
  hasSessionSelected: boolean
  editorWorkspaceView: EditorWorkspaceView
  selectedCampaign: CampaignSummary | null
  membershipRole: Role
  themeMode: 'light' | 'dark'
  apiUrl: string
  token: string
  currentSessionId: UUID | null
  currentSessionState: SessionState | null
  userId: UUID
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  connectionStatus: {
    statusColorKey: string
    label: string
    coreWsState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'
  }
  settingsCampaignSessionsCount: number
  settingsCampaignTotalDurationMs: number
  settingsCampaignSessions: Session[]
  settingsReferenceSessionId: UUID | null
  settingsData: CampaignSettingsPayload | null
  isInviteReissuing: boolean
  isSettingsLoading: boolean
  isSettingsSaving: boolean
  settingsName: string
  settingsDescription: string
  settingsPosterUrl: string
  settingsVisibility: 'PUBLIC' | 'PRIVATE'
  settingsSpectatorsEnabled: boolean
  settingsSpectatorMax: number
  settingsSpectatorWaitlistEnabled: boolean
  settingsSpectatorReconnectGraceSecs: number
  settingsPostSessionChatEnabled: boolean
  settingsPostSessionChatDurationMinutes: number
  settingsExtensionSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
  settingsLateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  settingsLateJoinGraceMinutes: number
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  selectedCampaignId: UUID | ''
  characterSettingsPanel: PlayerSettingsPanel
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  onSettingsNameChange: (value: string) => void
  onSettingsDescriptionChange: (value: string) => void
  onPosterFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void
  onSettingsPosterUrlChange: (value: string) => void
  onSettingsVisibilityChange: (value: 'PUBLIC' | 'PRIVATE') => void
  onSettingsSpectatorsEnabledChange: (value: boolean) => void
  onSettingsSpectatorMaxChange: (value: number) => void
  onSettingsSpectatorWaitlistEnabledChange: (value: boolean) => void
  onSettingsSpectatorReconnectGraceSecsChange: (value: number) => void
  onSettingsPostSessionChatEnabledChange: (value: boolean) => void
  onSettingsPostSessionChatDurationMinutesChange: (value: number) => void
  onSettingsExtensionSyncPolicyChange: (value: 'ALLOW' | 'DM_ONLY' | 'NONE') => void
  onSettingsLateJoinPolicyChange: (value: 'OPEN' | 'SCREENED' | 'BLOCKED') => void
  onSettingsLateJoinGraceMinutesChange: (value: number) => void
  onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value: boolean) => void
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onSaveCampaignSettings: () => void
  onCharacterFieldChange: (field: keyof PlayerSettingsPanel, value: string | number) => void
  onSaveCharacterSettings: () => void
  onSettingsReferenceSessionChange: (sessionId: UUID) => void
  onBackToLobby: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onLaunch: (campaignId: UUID) => void
  onSaveCampaignInfo: (
    campaignId: UUID,
    updates: {
      name: string
      description: string
      posterUrl: string | null
      integrationSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
    }
  ) => Promise<void>
  isLaunchDisabled: boolean
  launchDisabledReason: string
}
