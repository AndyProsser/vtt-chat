import type { ComponentProps } from 'react'
import { LobbyModals } from '@/components/workspaces/lobby/modals/LobbyModals'
import { toValidPostSessionDurationMinutes } from '@/utils/session/workspaces'

type BuildLobbyModalsPropsParams = {
  showCreateCampaignModal: boolean
  user: ComponentProps<typeof LobbyModals>['user']
  newCampaignName: string
  isCreatingCampaign: boolean
  onCloseCreateCampaign: ComponentProps<typeof LobbyModals>['onCloseCreateCampaign']
  onCreateCampaignSubmit: ComponentProps<typeof LobbyModals>['onCreateCampaignSubmit']
  onNewCampaignNameChange: ComponentProps<typeof LobbyModals>['onNewCampaignNameChange']
  showJoinCampaignModal: boolean
  joinInviteInput: string
  isJoiningCampaign: boolean
  onJoinCampaignSubmit: ComponentProps<typeof LobbyModals>['onJoinCampaignSubmit']
  onJoinInviteInputChange: ComponentProps<typeof LobbyModals>['onJoinInviteInputChange']
  onCloseJoinCampaign: ComponentProps<typeof LobbyModals>['onCloseJoinCampaign']
  showCampaignSettingsModal: boolean
  settingsHomeTab: ComponentProps<typeof LobbyModals>['settingsHomeTab']
  onSettingsHomeTabChange: ComponentProps<typeof LobbyModals>['onSettingsHomeTabChange']
  settingsCampaignSessions: ComponentProps<typeof LobbyModals>['settingsCampaignSessions']
  settingsReferenceSessionId: ComponentProps<typeof LobbyModals>['settingsReferenceSessionId']
  onSettingsReferenceSessionChange: ComponentProps<
    typeof LobbyModals
  >['onSettingsReferenceSessionChange']
  settingsReferenceSession: ComponentProps<typeof LobbyModals>['settingsReferenceSession']
  isSettingsLoading: boolean
  settingsData: ComponentProps<typeof LobbyModals>['settingsData']
  isSettingsSaving: boolean
  onCloseCampaignSettings: ComponentProps<typeof LobbyModals>['onCloseCampaignSettings']
  onSaveCampaignSettings: ComponentProps<typeof LobbyModals>['onSaveCampaignSettings']
  settingsName: string
  onSettingsNameChange: ComponentProps<typeof LobbyModals>['onSettingsNameChange']
  settingsDescription: string
  onSettingsDescriptionChange: ComponentProps<typeof LobbyModals>['onSettingsDescriptionChange']
  onPosterFileSelected: ComponentProps<typeof LobbyModals>['onPosterFileSelected']
  isInviteReissuing: boolean
  onCopyInviteUrl: ComponentProps<typeof LobbyModals>['onCopyInviteUrl']
  onReissueInvite: ComponentProps<typeof LobbyModals>['onReissueInvite']
  showReissueInviteModal: boolean
  reissueInviteType: ComponentProps<typeof LobbyModals>['reissueInviteType']
  onCloseReissueInviteModal: ComponentProps<typeof LobbyModals>['onCloseReissueInviteModal']
  onConfirmReissueInvite: ComponentProps<typeof LobbyModals>['onConfirmReissueInvite']
  settingsVisibility: ComponentProps<typeof LobbyModals>['settingsVisibility']
  onSettingsVisibilityChange: ComponentProps<typeof LobbyModals>['onSettingsVisibilityChange']
  settingsSpectatorsEnabled: boolean
  onSettingsSpectatorsEnabledChange: ComponentProps<
    typeof LobbyModals
  >['onSettingsSpectatorsEnabledChange']
  settingsSpectatorMax: number
  onSettingsSpectatorMaxChange: ComponentProps<typeof LobbyModals>['onSettingsSpectatorMaxChange']
  settingsSpectatorWaitlistEnabled: boolean
  onSettingsSpectatorWaitlistEnabledChange: ComponentProps<
    typeof LobbyModals
  >['onSettingsSpectatorWaitlistEnabledChange']
  settingsSpectatorReconnectGraceSecs: number
  onSettingsSpectatorReconnectGraceSecsChange: ComponentProps<
    typeof LobbyModals
  >['onSettingsSpectatorReconnectGraceSecsChange']
  settingsPostSessionChatEnabled: boolean
  onSettingsPostSessionChatEnabledChange: ComponentProps<
    typeof LobbyModals
  >['onSettingsPostSessionChatEnabledChange']
  settingsPostSessionChatDurationMinutes: number
  onSettingsPostSessionChatDurationMinutesChange: (value: number) => void
  settingsExtensionSyncPolicy: ComponentProps<typeof LobbyModals>['settingsExtensionSyncPolicy']
  onSettingsExtensionSyncPolicyChange: ComponentProps<
    typeof LobbyModals
  >['onSettingsExtensionSyncPolicyChange']
  settingsLateJoinPolicy: ComponentProps<typeof LobbyModals>['settingsLateJoinPolicy']
  onSettingsLateJoinPolicyChange: ComponentProps<
    typeof LobbyModals
  >['onSettingsLateJoinPolicyChange']
  settingsLateJoinGraceMinutes: number
  onSettingsLateJoinGraceMinutesChange: ComponentProps<
    typeof LobbyModals
  >['onSettingsLateJoinGraceMinutesChange']
  selectedCampaignName: string | undefined
}

export function buildLobbyModalsProps(
  params: BuildLobbyModalsPropsParams
): ComponentProps<typeof LobbyModals> {
  return {
    showCreateCampaignModal: params.showCreateCampaignModal,
    user: params.user,
    newCampaignName: params.newCampaignName,
    isCreatingCampaign: params.isCreatingCampaign,
    onCloseCreateCampaign: params.onCloseCreateCampaign,
    onCreateCampaignSubmit: params.onCreateCampaignSubmit,
    onNewCampaignNameChange: params.onNewCampaignNameChange,
    showJoinCampaignModal: params.showJoinCampaignModal,
    joinInviteInput: params.joinInviteInput,
    isJoiningCampaign: params.isJoiningCampaign,
    onJoinCampaignSubmit: params.onJoinCampaignSubmit,
    onJoinInviteInputChange: params.onJoinInviteInputChange,
    onCloseJoinCampaign: params.onCloseJoinCampaign,
    showCampaignSettingsModal: params.showCampaignSettingsModal,
    settingsHomeTab: params.settingsHomeTab,
    onSettingsHomeTabChange: params.onSettingsHomeTabChange,
    settingsCampaignSessions: params.settingsCampaignSessions,
    settingsReferenceSessionId: params.settingsReferenceSessionId,
    onSettingsReferenceSessionChange: params.onSettingsReferenceSessionChange,
    settingsReferenceSession: params.settingsReferenceSession,
    isSettingsLoading: params.isSettingsLoading,
    settingsData: params.settingsData,
    isSettingsSaving: params.isSettingsSaving,
    onCloseCampaignSettings: params.onCloseCampaignSettings,
    onSaveCampaignSettings: params.onSaveCampaignSettings,
    settingsName: params.settingsName,
    onSettingsNameChange: params.onSettingsNameChange,
    settingsDescription: params.settingsDescription,
    onSettingsDescriptionChange: params.onSettingsDescriptionChange,
    onPosterFileSelected: params.onPosterFileSelected,
    isInviteReissuing: params.isInviteReissuing,
    onCopyInviteUrl: params.onCopyInviteUrl,
    onReissueInvite: params.onReissueInvite,
    showReissueInviteModal: params.showReissueInviteModal,
    reissueInviteType: params.reissueInviteType,
    onCloseReissueInviteModal: params.onCloseReissueInviteModal,
    onConfirmReissueInvite: params.onConfirmReissueInvite,
    settingsVisibility: params.settingsVisibility,
    onSettingsVisibilityChange: params.onSettingsVisibilityChange,
    settingsSpectatorsEnabled: params.settingsSpectatorsEnabled,
    onSettingsSpectatorsEnabledChange: params.onSettingsSpectatorsEnabledChange,
    settingsSpectatorMax: params.settingsSpectatorMax,
    onSettingsSpectatorMaxChange: params.onSettingsSpectatorMaxChange,
    settingsSpectatorWaitlistEnabled: params.settingsSpectatorWaitlistEnabled,
    onSettingsSpectatorWaitlistEnabledChange: params.onSettingsSpectatorWaitlistEnabledChange,
    settingsSpectatorReconnectGraceSecs: params.settingsSpectatorReconnectGraceSecs,
    onSettingsSpectatorReconnectGraceSecsChange: params.onSettingsSpectatorReconnectGraceSecsChange,
    settingsPostSessionChatEnabled: params.settingsPostSessionChatEnabled,
    onSettingsPostSessionChatEnabledChange: params.onSettingsPostSessionChatEnabledChange,
    settingsPostSessionChatDurationMinutes: params.settingsPostSessionChatDurationMinutes,
    onSettingsPostSessionChatDurationMinutesChange: (value) =>
      params.onSettingsPostSessionChatDurationMinutesChange(
        toValidPostSessionDurationMinutes(value)
      ),
    settingsExtensionSyncPolicy: params.settingsExtensionSyncPolicy,
    onSettingsExtensionSyncPolicyChange: params.onSettingsExtensionSyncPolicyChange,
    settingsLateJoinPolicy: params.settingsLateJoinPolicy,
    onSettingsLateJoinPolicyChange: params.onSettingsLateJoinPolicyChange,
    settingsLateJoinGraceMinutes: params.settingsLateJoinGraceMinutes,
    onSettingsLateJoinGraceMinutesChange: params.onSettingsLateJoinGraceMinutesChange,
    selectedCampaignName: params.selectedCampaignName,
  }
}
