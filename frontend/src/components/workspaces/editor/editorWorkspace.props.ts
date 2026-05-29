import type { ComponentProps } from 'react'
import type { UUID } from '@shared'
import { EditorWorkspace } from '@/components/workspaces/EditorWorkspace'
import type { SupportedPlatform } from '@/constants/sessionUi.types'
import type { Session } from '@/types/session'
import { getCampaignEntryAction } from '@/types/session/campaign'

type BuildEditorWorkspacePropsParams = {
  hasSessionSelected: boolean
  editorWorkspaceView: ComponentProps<typeof EditorWorkspace>['editorWorkspaceView']
  selectedCampaign: ComponentProps<typeof EditorWorkspace>['selectedCampaign']
  membershipRole: ComponentProps<typeof EditorWorkspace>['membershipRole']
  themeMode: ComponentProps<typeof EditorWorkspace>['themeMode']
  apiUrl: string
  token: string
  currentSessionId: UUID | null
  currentSessionState: ComponentProps<typeof EditorWorkspace>['currentSessionState']
  userId: UUID
  partyPresenceRefreshVersion: number
  fetchWithAuthGuard: ComponentProps<typeof EditorWorkspace>['fetchWithAuthGuard']
  connectionStatus: ComponentProps<typeof EditorWorkspace>['connectionStatus']
  settingsCampaignSessionsCount: number
  settingsCampaignTotalDurationMs: number
  settingsCampaignSessions: Session[]
  settingsReferenceSessionId: UUID | null
  settingsData: ComponentProps<typeof EditorWorkspace>['settingsData']
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
  settingsDefaultSessionDurationMins: number
  settingsSupportedPlatforms: SupportedPlatform[]
  sessionSettingsName: string
  selectedCampaignId: UUID | ''
  characterSettingsPanel: ComponentProps<typeof EditorWorkspace>['characterSettingsPanel']
  isCharacterSettingsLoading: boolean
  isCharacterSettingsSaving: boolean
  onSettingsNameChange: ComponentProps<typeof EditorWorkspace>['onSettingsNameChange']
  onSettingsDescriptionChange: ComponentProps<typeof EditorWorkspace>['onSettingsDescriptionChange']
  onPosterFileSelected: ComponentProps<typeof EditorWorkspace>['onPosterFileSelected']
  onSettingsPosterUrlChange: ComponentProps<typeof EditorWorkspace>['onSettingsPosterUrlChange']
  onSettingsVisibilityChange: ComponentProps<typeof EditorWorkspace>['onSettingsVisibilityChange']
  onSettingsSpectatorsEnabledChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsSpectatorsEnabledChange']
  onSettingsSpectatorMaxChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsSpectatorMaxChange']
  onSettingsSpectatorWaitlistEnabledChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsSpectatorWaitlistEnabledChange']
  onSettingsSpectatorReconnectGraceSecsChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsSpectatorReconnectGraceSecsChange']
  onSettingsPostSessionChatEnabledChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsPostSessionChatEnabledChange']
  onSettingsPostSessionChatDurationMinutesChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsPostSessionChatDurationMinutesChange']
  onSettingsExtensionSyncPolicyChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsExtensionSyncPolicyChange']
  onSettingsLateJoinPolicyChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsLateJoinPolicyChange']
  onSettingsLateJoinGraceMinutesChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsLateJoinGraceMinutesChange']
  onSettingsDmAutoTargetOnFirstPlayerJoinChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsDmAutoTargetOnFirstPlayerJoinChange']
  onSettingsDefaultSessionDurationMinsChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsDefaultSessionDurationMinsChange']
  onSettingsSupportedPlatformsChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsSupportedPlatformsChange']
  onSessionNameChange: ComponentProps<typeof EditorWorkspace>['onSessionNameChange']
  onCopyInviteUrl: ComponentProps<typeof EditorWorkspace>['onCopyInviteUrl']
  onReissueInvite: ComponentProps<typeof EditorWorkspace>['onReissueInvite']
  onSaveCampaignSettings: ComponentProps<typeof EditorWorkspace>['onSaveCampaignSettings']
  onCharacterFieldChange: ComponentProps<typeof EditorWorkspace>['onCharacterFieldChange']
  onSaveCharacterSettings: ComponentProps<typeof EditorWorkspace>['onSaveCharacterSettings']
  onSettingsReferenceSessionChange: ComponentProps<
    typeof EditorWorkspace
  >['onSettingsReferenceSessionChange']
  onBackToLobby: ComponentProps<typeof EditorWorkspace>['onBackToLobby']
  onToggleTheme: ComponentProps<typeof EditorWorkspace>['onToggleTheme']
  onOpenUserSettings: ComponentProps<typeof EditorWorkspace>['onOpenUserSettings']
  onLaunch: ComponentProps<typeof EditorWorkspace>['onLaunch']
  onSaveCampaignInfo: ComponentProps<typeof EditorWorkspace>['onSaveCampaignInfo']
  onDeleteCampaign: ComponentProps<typeof EditorWorkspace>['onDeleteCampaign']
  isDeletingCampaign: boolean
}

export function buildEditorWorkspaceProps(
  params: BuildEditorWorkspacePropsParams
): ComponentProps<typeof EditorWorkspace> {
  return {
    hasSessionSelected: params.hasSessionSelected,
    editorWorkspaceView: params.editorWorkspaceView,
    selectedCampaign: params.selectedCampaign,
    membershipRole: params.membershipRole,
    themeMode: params.themeMode,
    apiUrl: params.apiUrl,
    token: params.token,
    currentSessionId: params.currentSessionId,
    currentSessionState: params.currentSessionState,
    userId: params.userId,
    partyPresenceRefreshVersion: params.partyPresenceRefreshVersion,
    fetchWithAuthGuard: params.fetchWithAuthGuard,
    connectionStatus: params.connectionStatus,
    settingsCampaignSessionsCount: params.settingsCampaignSessionsCount,
    settingsCampaignTotalDurationMs: params.settingsCampaignTotalDurationMs,
    settingsCampaignSessions: params.settingsCampaignSessions,
    settingsReferenceSessionId: params.settingsReferenceSessionId,
    settingsData: params.settingsData,
    isInviteReissuing: params.isInviteReissuing,
    isSettingsLoading: params.isSettingsLoading,
    isSettingsSaving: params.isSettingsSaving,
    settingsName: params.settingsName,
    settingsDescription: params.settingsDescription,
    settingsPosterUrl: params.settingsPosterUrl,
    settingsVisibility: params.settingsVisibility,
    settingsSpectatorsEnabled: params.settingsSpectatorsEnabled,
    settingsSpectatorMax: params.settingsSpectatorMax,
    settingsSpectatorWaitlistEnabled: params.settingsSpectatorWaitlistEnabled,
    settingsSpectatorReconnectGraceSecs: params.settingsSpectatorReconnectGraceSecs,
    settingsPostSessionChatEnabled: params.settingsPostSessionChatEnabled,
    settingsPostSessionChatDurationMinutes: params.settingsPostSessionChatDurationMinutes,
    settingsExtensionSyncPolicy: params.settingsExtensionSyncPolicy,
    settingsLateJoinPolicy: params.settingsLateJoinPolicy,
    settingsLateJoinGraceMinutes: params.settingsLateJoinGraceMinutes,
    settingsDmAutoTargetOnFirstPlayerJoin: params.settingsDmAutoTargetOnFirstPlayerJoin,
    settingsDefaultSessionDurationMins: params.settingsDefaultSessionDurationMins,
    settingsSupportedPlatforms: params.settingsSupportedPlatforms,
    sessionSettingsName: params.sessionSettingsName,
    selectedCampaignId: params.selectedCampaignId,
    characterSettingsPanel: params.characterSettingsPanel,
    isCharacterSettingsLoading: params.isCharacterSettingsLoading,
    isCharacterSettingsSaving: params.isCharacterSettingsSaving,
    onSettingsNameChange: params.onSettingsNameChange,
    onSettingsDescriptionChange: params.onSettingsDescriptionChange,
    onPosterFileSelected: params.onPosterFileSelected,
    onSettingsPosterUrlChange: params.onSettingsPosterUrlChange,
    onSettingsVisibilityChange: params.onSettingsVisibilityChange,
    onSettingsSpectatorsEnabledChange: params.onSettingsSpectatorsEnabledChange,
    onSettingsSpectatorMaxChange: params.onSettingsSpectatorMaxChange,
    onSettingsSpectatorWaitlistEnabledChange: params.onSettingsSpectatorWaitlistEnabledChange,
    onSettingsSpectatorReconnectGraceSecsChange: params.onSettingsSpectatorReconnectGraceSecsChange,
    onSettingsPostSessionChatEnabledChange: params.onSettingsPostSessionChatEnabledChange,
    onSettingsPostSessionChatDurationMinutesChange:
      params.onSettingsPostSessionChatDurationMinutesChange,
    onSettingsExtensionSyncPolicyChange: params.onSettingsExtensionSyncPolicyChange,
    onSettingsLateJoinPolicyChange: params.onSettingsLateJoinPolicyChange,
    onSettingsLateJoinGraceMinutesChange: params.onSettingsLateJoinGraceMinutesChange,
    onSettingsDmAutoTargetOnFirstPlayerJoinChange:
      params.onSettingsDmAutoTargetOnFirstPlayerJoinChange,
    onSettingsDefaultSessionDurationMinsChange: params.onSettingsDefaultSessionDurationMinsChange,
    onSettingsSupportedPlatformsChange: params.onSettingsSupportedPlatformsChange,
    onSessionNameChange: params.onSessionNameChange,
    onCopyInviteUrl: params.onCopyInviteUrl,
    onReissueInvite: params.onReissueInvite,
    onSaveCampaignSettings: params.onSaveCampaignSettings,
    onCharacterFieldChange: params.onCharacterFieldChange,
    onSaveCharacterSettings: params.onSaveCharacterSettings,
    onSettingsReferenceSessionChange: params.onSettingsReferenceSessionChange,
    onBackToLobby: params.onBackToLobby,
    onToggleTheme: params.onToggleTheme,
    onOpenUserSettings: params.onOpenUserSettings,
    onLaunch: params.onLaunch,
    onSaveCampaignInfo: params.onSaveCampaignInfo,
    onDeleteCampaign: params.onDeleteCampaign,
    isDeletingCampaign: params.isDeletingCampaign,
    isLaunchDisabled: params.selectedCampaign
      ? getCampaignEntryAction(params.selectedCampaign).disabled
      : true,
    launchDisabledReason: params.selectedCampaign
      ? (getCampaignEntryAction(params.selectedCampaign).reason ?? 'Select a campaign first.')
      : 'Select a campaign first.',
  }
}
