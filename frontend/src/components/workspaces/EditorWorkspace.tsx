import { WorkspaceView } from '@/components/workspaces/editor/WorkspaceView'
import { EditorWorkspaceSettingsPanel } from '@/components/workspaces/EditorWorkspace.SettingsPanel'
import type { EditorWorkspaceProps } from '@/components/workspaces/EditorWorkspace.types'

export function EditorWorkspace(props: EditorWorkspaceProps) {
  if (props.hasSessionSelected || props.editorWorkspaceView !== 'editor') {
    return null
  }

  return (
    <WorkspaceView
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
        <EditorWorkspaceSettingsPanel
          membershipRole={props.membershipRole}
          selectedCampaign={props.selectedCampaign}
          selectedCampaignId={props.selectedCampaignId}
          userId={props.userId}
          settingsData={props.settingsData}
          isInviteReissuing={props.isInviteReissuing}
          isSettingsLoading={props.isSettingsLoading}
          isSettingsSaving={props.isSettingsSaving}
          settingsName={props.settingsName}
          onSettingsNameChange={props.onSettingsNameChange}
          settingsDescription={props.settingsDescription}
          onSettingsDescriptionChange={props.onSettingsDescriptionChange}
          onPosterFileSelected={props.onPosterFileSelected}
          settingsPosterUrl={props.settingsPosterUrl}
          onSettingsPosterUrlChange={props.onSettingsPosterUrlChange}
          settingsVisibility={props.settingsVisibility}
          onSettingsVisibilityChange={props.onSettingsVisibilityChange}
          settingsSpectatorsEnabled={props.settingsSpectatorsEnabled}
          onSettingsSpectatorsEnabledChange={props.onSettingsSpectatorsEnabledChange}
          settingsSpectatorMax={props.settingsSpectatorMax}
          onSettingsSpectatorMaxChange={props.onSettingsSpectatorMaxChange}
          settingsSpectatorWaitlistEnabled={props.settingsSpectatorWaitlistEnabled}
          onSettingsSpectatorWaitlistEnabledChange={props.onSettingsSpectatorWaitlistEnabledChange}
          settingsSpectatorReconnectGraceSecs={props.settingsSpectatorReconnectGraceSecs}
          onSettingsSpectatorReconnectGraceSecsChange={props.onSettingsSpectatorReconnectGraceSecsChange}
          settingsPostSessionChatEnabled={props.settingsPostSessionChatEnabled}
          onSettingsPostSessionChatEnabledChange={props.onSettingsPostSessionChatEnabledChange}
          settingsPostSessionChatDurationMinutes={props.settingsPostSessionChatDurationMinutes}
          onSettingsPostSessionChatDurationMinutesChange={
            props.onSettingsPostSessionChatDurationMinutesChange
          }
          settingsExtensionSyncPolicy={props.settingsExtensionSyncPolicy}
          onSettingsExtensionSyncPolicyChange={props.onSettingsExtensionSyncPolicyChange}
          settingsLateJoinPolicy={props.settingsLateJoinPolicy}
          onSettingsLateJoinPolicyChange={props.onSettingsLateJoinPolicyChange}
          settingsLateJoinGraceMinutes={props.settingsLateJoinGraceMinutes}
          onSettingsLateJoinGraceMinutesChange={props.onSettingsLateJoinGraceMinutesChange}
          settingsDmAutoTargetOnFirstPlayerJoin={props.settingsDmAutoTargetOnFirstPlayerJoin}
          onSettingsDmAutoTargetOnFirstPlayerJoinChange={
            props.onSettingsDmAutoTargetOnFirstPlayerJoinChange
          }
          onCopyInviteUrl={props.onCopyInviteUrl}
          onReissueInvite={props.onReissueInvite}
          onSaveCampaignSettings={props.onSaveCampaignSettings}
          characterSettingsDraft={props.characterSettingsDraft}
          onCharacterFieldChange={props.onCharacterFieldChange}
          onSaveCharacterSettings={props.onSaveCharacterSettings}
          isCharacterSettingsLoading={props.isCharacterSettingsLoading}
          isCharacterSettingsSaving={props.isCharacterSettingsSaving}
        />
      }
      onBackToLobby={props.onBackToLobby}
      onToggleTheme={props.onToggleTheme}
      onOpenUserSettings={props.onOpenUserSettings}
      onLaunch={props.onLaunch}
      onCopyInviteUrl={props.onCopyInviteUrl}
      onReissueInvite={props.onReissueInvite}
      onSaveCampaignInfo={props.onSaveCampaignInfo}
    />
  )
}
