import { type CoreWsState, type Role, type SessionState, type UUID } from '@shared'
import type { ShowToastInput } from '@/state/toastCenter'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import type {
  CampaignVisibility,
  ExtensionSyncPolicy,
  LateJoinPolicy,
  SupportedPlatform,
} from '@/types/sessionUi'
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
    coreWsState: CoreWsState
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
  settingsVisibility: CampaignVisibility
  settingsSpectatorsEnabled: boolean
  settingsSpectatorMax: number
  settingsSpectatorWaitlistEnabled: boolean
  settingsSpectatorReconnectGraceSecs: number
  settingsPostSessionChatEnabled: boolean
  settingsPostSessionChatDurationMinutes: number
  settingsExtensionSyncPolicy: ExtensionSyncPolicy
  settingsLateJoinPolicy: LateJoinPolicy
  settingsLateJoinGraceMinutes: number
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  settingsDefaultSessionDurationMins: number
  settingsSupportedPlatforms: SupportedPlatform[]
  settingsDndRuleset: '2014' | '2024'
  sessionSettingsName: string
  selectedCampaignId: UUID | ''
  characterSettingsPanel: PlayerSettingsPanel
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  onSettingsNameChange: (value: string) => void
  onSettingsDescriptionChange: (value: string) => void
  onPosterFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void
  onSettingsPosterUrlChange: (value: string) => void
  onSettingsVisibilityChange: (value: CampaignVisibility) => void
  onSettingsSpectatorsEnabledChange: (value: boolean) => void
  onSettingsSpectatorMaxChange: (value: number) => void
  onSettingsSpectatorWaitlistEnabledChange: (value: boolean) => void
  onSettingsSpectatorReconnectGraceSecsChange: (value: number) => void
  onSettingsPostSessionChatEnabledChange: (value: boolean) => void
  onSettingsPostSessionChatDurationMinutesChange: (value: number) => void
  onSettingsExtensionSyncPolicyChange: (value: ExtensionSyncPolicy) => void
  onSettingsLateJoinPolicyChange: (value: LateJoinPolicy) => void
  onSettingsLateJoinGraceMinutesChange: (value: number) => void
  onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value: boolean) => void
  onSettingsDefaultSessionDurationMinsChange: (value: number) => void
  onSettingsSupportedPlatformsChange: (value: SupportedPlatform[]) => void
  onSettingsDndRulesetChange: (value: '2014' | '2024') => void
  onSessionNameChange: (value: string) => void
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
      integrationSyncPolicy: ExtensionSyncPolicy
    }
  ) => Promise<void>
  onDeleteCampaign: (campaignId: UUID) => Promise<void>
  isDeletingCampaign: boolean
  isLaunchDisabled: boolean
  launchDisabledReason: string
  showToast: (input: ShowToastInput) => void
}
