import { TooltipProvider } from '@/components/ui'
import {
  CampaignSettingsModal,
  CreateCampaignModal,
  ExitSessionModal,
  JoinCampaignModal,
  ReissueInviteModal,
  StopSessionModal,
  UserSettingsModal,
  type ModalsProps,
} from '@/components/workspaces/shared/modals'

export function Modals(props: ModalsProps) {
  const shouldWarnDmDuringActivePlay =
    props.effectiveSessionRole === 'DM' &&
    (props.currentSessionState === 'ACTIVE' || props.currentSessionState === 'PAUSED')
  const shouldWarnDmDuringWrapUp =
    props.effectiveSessionRole === 'DM' && props.currentSessionState === 'COOLDOWN'

  const leaveSessionWarning = shouldWarnDmDuringActivePlay
    ? 'If you leave now, everyone gets the surprise ending. Even if they were mid-scene.'
    : shouldWarnDmDuringWrapUp
      ? 'If you can, stick around until the wrap-up finishes. The curtain is already falling.'
      : null

  return (
    <TooltipProvider delayDuration={140}>
      <>
        <CreateCampaignModal
          showCreateCampaignModal={props.showCreateCampaignModal}
          user={props.user}
          newCampaignName={props.newCampaignName}
          isCreatingCampaign={props.isCreatingCampaign}
          onCloseCreateCampaign={props.onCloseCreateCampaign}
          onCreateCampaignSubmit={props.onCreateCampaignSubmit}
          onNewCampaignNameChange={props.onNewCampaignNameChange}
        />

        <JoinCampaignModal
          showJoinCampaignModal={props.showJoinCampaignModal}
          joinInviteInput={props.joinInviteInput}
          isJoiningCampaign={props.isJoiningCampaign}
          onJoinCampaignSubmit={props.onJoinCampaignSubmit}
          onJoinInviteInputChange={props.onJoinInviteInputChange}
          onCloseJoinCampaign={props.onCloseJoinCampaign}
        />

        <CampaignSettingsModal
          showCampaignSettingsModal={props.showCampaignSettingsModal}
          isSettingsSaving={props.isSettingsSaving}
          settingsHomeTab={props.settingsHomeTab}
          settingsData={props.settingsData}
          settingsName={props.settingsName}
          onCloseCampaignSettings={props.onCloseCampaignSettings}
          onSettingsHomeTabChange={props.onSettingsHomeTabChange}
          settingsReferenceSessionId={props.settingsReferenceSessionId}
          settingsCampaignSessions={props.settingsCampaignSessions}
          onSettingsReferenceSessionChange={props.onSettingsReferenceSessionChange}
          settingsReferenceSession={props.settingsReferenceSession}
          isSettingsLoading={props.isSettingsLoading}
          selectedCampaignName={props.selectedCampaignName}
          onSaveCampaignSettings={props.onSaveCampaignSettings}
          onSettingsNameChange={props.onSettingsNameChange}
          settingsDescription={props.settingsDescription}
          onSettingsDescriptionChange={props.onSettingsDescriptionChange}
          onPosterFileSelected={props.onPosterFileSelected}
          isInviteReissuing={props.isInviteReissuing}
          onCopyInviteUrl={props.onCopyInviteUrl}
          onReissueInvite={props.onReissueInvite}
          settingsVisibility={props.settingsVisibility}
          onSettingsVisibilityChange={props.onSettingsVisibilityChange}
          settingsSpectatorsEnabled={props.settingsSpectatorsEnabled}
          onSettingsSpectatorsEnabledChange={props.onSettingsSpectatorsEnabledChange}
          settingsSpectatorMax={props.settingsSpectatorMax}
          onSettingsSpectatorMaxChange={props.onSettingsSpectatorMaxChange}
          settingsSpectatorWaitlistEnabled={props.settingsSpectatorWaitlistEnabled}
          onSettingsSpectatorWaitlistEnabledChange={props.onSettingsSpectatorWaitlistEnabledChange}
          settingsSpectatorReconnectGraceSecs={props.settingsSpectatorReconnectGraceSecs}
          onSettingsSpectatorReconnectGraceSecsChange={
            props.onSettingsSpectatorReconnectGraceSecsChange
          }
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
        />

        <UserSettingsModal
          showUserSettingsModal={props.showUserSettingsModal}
          onUserSettingsOpenChange={props.onUserSettingsOpenChange}
          messageGroupingWindowMs={props.messageGroupingWindowMs}
          onMessageGroupingWindowChange={props.onMessageGroupingWindowChange}
          apiUrl={props.apiUrl}
          token={props.token}
          user={props.user}
        />

        <ExitSessionModal
          showExitSessionModal={props.showExitSessionModal}
          leaveSessionWarning={leaveSessionWarning}
          user={props.user}
          exitUpgradePassword={props.exitUpgradePassword}
          onExitUpgradePasswordChange={props.onExitUpgradePasswordChange}
          exitUpgradeLoading={props.exitUpgradeLoading}
          exitUpgradeError={props.exitUpgradeError}
          onCloseExitSession={props.onCloseExitSession}
          onSkipGuestUpgrade={props.onSkipGuestUpgrade}
          onUpgradeAndExit={props.onUpgradeAndExit}
          onConfirmExitAsFullAccount={props.onConfirmExitAsFullAccount}
        />

        <StopSessionModal
          showStopSessionModal={props.showStopSessionModal}
          onCloseStopSession={props.onCloseStopSession}
          onConfirmStopSession={props.onConfirmStopSession}
        />

        <ReissueInviteModal
          showReissueInviteModal={props.showReissueInviteModal}
          onCloseReissueInviteModal={props.onCloseReissueInviteModal}
          reissueInviteType={props.reissueInviteType}
          isInviteReissuing={props.isInviteReissuing}
          onConfirmReissueInvite={props.onConfirmReissueInvite}
        />
      </>
    </TooltipProvider>
  )
}
