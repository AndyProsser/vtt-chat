import { EditorView } from '@/components/workspaces/editor/EditorView'
import { WorkspaceSettingsPanel } from '@/components/workspaces/shared/panels/WorkspaceSettingsPanel'
import type { EditorWorkspaceProps } from '@/types/editorWorkspace'

export function EditorWorkspace(props: EditorWorkspaceProps) {
  if (props.hasSessionSelected || props.editorWorkspaceView !== 'editor') {
    return null
  }

  return (
    <EditorView
      campaign={props.selectedCampaign}
      role={props.membershipRole}
      themeMode={props.themeMode}
      apiUrl={props.apiUrl}
      authToken={props.token}
      currentSessionId={props.currentSessionId}
      currentSessionState={props.currentSessionState}
      currentUserId={props.userId}
      partyPresenceRefreshVersion={props.partyPresenceRefreshVersion}
      fetchWithAuthGuard={props.fetchWithAuthGuard}
      connectionStatus={props.connectionStatus}
      sessionCount={props.settingsCampaignSessionsCount}
      totalSessionDurationMs={props.settingsCampaignTotalDurationMs}
      settingsCampaignSessions={props.settingsCampaignSessions}
      settingsReferenceSessionId={props.settingsReferenceSessionId}
      canEditCampaignInfo={Boolean(
        props.selectedCampaign && props.selectedCampaign.currentDmId === props.userId
      )}
      isLaunchDisabled={props.isLaunchDisabled}
      launchDisabledReason={props.launchDisabledReason}
      showInviteWidget={Boolean(
        props.selectedCampaign && props.selectedCampaign.currentDmId === props.userId
      )}
      joinUrl={
        props.settingsData?.inviteCode
          ? `${window.location.origin}/join/${encodeURIComponent(props.settingsData.inviteCode)}`
          : props.selectedCampaign?.inviteCode
            ? `${window.location.origin}/join/${encodeURIComponent(props.selectedCampaign.inviteCode)}`
            : ''
      }
      watchUrl={
        props.settingsData?.spectatorInviteCode || props.selectedCampaign?.spectatorInviteCode
          ? `${window.location.origin}/watch/${encodeURIComponent(props.settingsData?.spectatorInviteCode || props.selectedCampaign?.spectatorInviteCode || '')}`
          : ''
      }
      spectatorsEnabled={
        props.settingsData
          ? props.settingsData.spectatorPolicy !== 'NONE'
          : Boolean(props.selectedCampaign?.spectatorsEnabled)
      }
      isInviteReissuing={props.isInviteReissuing}
      settingsPanel={
        <WorkspaceSettingsPanel
          role={
            props.membershipRole === 'DM'
              ? 'DM'
              : props.membershipRole === 'PLAYER'
                ? 'PLAYER'
                : 'SPECTATOR'
          }
          campaignSettings={{
            campaignName: props.selectedCampaign?.name,
            isLoading: props.isSettingsLoading,
            isSaving: props.isSettingsSaving,
            isInviteReissuing: props.isInviteReissuing,
            settingsData: props.settingsData,
            settingsName: props.settingsName,
            onSettingsNameChange: props.onSettingsNameChange,
            settingsDescription: props.settingsDescription,
            onSettingsDescriptionChange: props.onSettingsDescriptionChange,
            onPosterFileSelected: props.onPosterFileSelected,
            settingsPosterUrl: props.settingsPosterUrl,
            onSettingsPosterUrlChange: props.onSettingsPosterUrlChange,
            onRemovePoster: () => props.onSettingsPosterUrlChange(''),
            settingsVisibility: props.settingsVisibility,
            onSettingsVisibilityChange: props.onSettingsVisibilityChange,
            settingsSpectatorsEnabled: props.settingsSpectatorsEnabled,
            onSettingsSpectatorsEnabledChange: props.onSettingsSpectatorsEnabledChange,
            settingsSpectatorMax: props.settingsSpectatorMax,
            onSettingsSpectatorMaxChange: props.onSettingsSpectatorMaxChange,
            settingsSpectatorWaitlistEnabled: props.settingsSpectatorWaitlistEnabled,
            onSettingsSpectatorWaitlistEnabledChange:
              props.onSettingsSpectatorWaitlistEnabledChange,
            settingsSpectatorReconnectGraceSecs: props.settingsSpectatorReconnectGraceSecs,
            onSettingsSpectatorReconnectGraceSecsChange:
              props.onSettingsSpectatorReconnectGraceSecsChange,
            settingsPostSessionChatEnabled: props.settingsPostSessionChatEnabled,
            onSettingsPostSessionChatEnabledChange: props.onSettingsPostSessionChatEnabledChange,
            settingsPostSessionChatDurationMinutes: props.settingsPostSessionChatDurationMinutes,
            onSettingsPostSessionChatDurationMinutesChange:
              props.onSettingsPostSessionChatDurationMinutesChange,
            settingsExtensionSyncPolicy: props.settingsExtensionSyncPolicy,
            onSettingsExtensionSyncPolicyChange: props.onSettingsExtensionSyncPolicyChange,
            settingsLateJoinPolicy: props.settingsLateJoinPolicy,
            onSettingsLateJoinPolicyChange: props.onSettingsLateJoinPolicyChange,
            settingsLateJoinGraceMinutes: props.settingsLateJoinGraceMinutes,
            onSettingsLateJoinGraceMinutesChange: props.onSettingsLateJoinGraceMinutesChange,
            settingsDmAutoTargetOnFirstPlayerJoin: props.settingsDmAutoTargetOnFirstPlayerJoin,
            onSettingsDmAutoTargetOnFirstPlayerJoinChange:
              props.onSettingsDmAutoTargetOnFirstPlayerJoinChange,
            settingsDefaultSessionDurationMins: props.settingsDefaultSessionDurationMins,
            onSettingsDefaultSessionDurationMinsChange:
              props.onSettingsDefaultSessionDurationMinsChange,
            settingsSupportedPlatforms: props.settingsSupportedPlatforms,
            onSettingsSupportedPlatformsChange: props.onSettingsSupportedPlatformsChange,
            isSessionActive:
              props.currentSessionState === 'ACTIVE' || props.currentSessionState === 'PAUSED',
            isEditorContext: true,
            onCopyInviteUrl: props.onCopyInviteUrl,
            onReissueInvite: props.onReissueInvite,
            onSave: props.onSaveCampaignSettings,
          }}
          playerSettings={{
            campaignId: props.selectedCampaignId || null,
            characterDraft: props.characterSettingsPanel,
            onCharacterFieldChange: props.onCharacterFieldChange,
            onSaveCharacterSettings: props.onSaveCharacterSettings,
            isCharacterLoading: props.isCharacterSettingsLoading,
            isCharacterSaving: props.isCharacterSettingsSaving,
          }}
        />
      }
      onBackToLobby={props.onBackToLobby}
      onToggleTheme={props.onToggleTheme}
      onOpenUserSettings={props.onOpenUserSettings}
      onLaunch={props.onLaunch}
      onCopyInviteUrl={props.onCopyInviteUrl}
      onReissueInvite={props.onReissueInvite}
      onSaveCampaignInfo={props.onSaveCampaignInfo}
      onSettingsReferenceSessionChange={props.onSettingsReferenceSessionChange}
    />
  )
}
