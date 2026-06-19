import { memo } from 'react'
import {
  CampaignSettingsModal,
  CreateCampaignModal,
  JoinCampaignModal,
  ReissueInviteModal,
} from '@/components/workspaces/shared/modals'
import type { ModalsProps } from '@/types/modals'

type LobbyModalsProps = Pick<
  ModalsProps,
  | 'showCreateCampaignModal'
  | 'user'
  | 'newCampaignName'
  | 'isCreatingCampaign'
  | 'pendingImportBundle'
  | 'conflictCampaign'
  | 'onCloseCreateCampaign'
  | 'onCreateCampaignSubmit'
  | 'onNewCampaignNameChange'
  | 'showJoinCampaignModal'
  | 'joinInviteInput'
  | 'isJoiningCampaign'
  | 'onJoinCampaignSubmit'
  | 'onJoinInviteInputChange'
  | 'onCloseJoinCampaign'
  | 'showCampaignSettingsModal'
  | 'isSettingsSaving'
  | 'settingsHomeTab'
  | 'settingsData'
  | 'settingsName'
  | 'onCloseCampaignSettings'
  | 'onSettingsHomeTabChange'
  | 'settingsReferenceSessionId'
  | 'settingsCampaignSessions'
  | 'onSettingsReferenceSessionChange'
  | 'settingsReferenceSession'
  | 'isSettingsLoading'
  | 'selectedCampaignName'
  | 'onSaveCampaignSettings'
  | 'onSettingsNameChange'
  | 'settingsDescription'
  | 'onSettingsDescriptionChange'
  | 'onPosterFileSelected'
  | 'isInviteReissuing'
  | 'onCopyInviteUrl'
  | 'onReissueInvite'
  | 'settingsVisibility'
  | 'onSettingsVisibilityChange'
  | 'settingsSpectatorsEnabled'
  | 'onSettingsSpectatorsEnabledChange'
  | 'settingsSpectatorMax'
  | 'onSettingsSpectatorMaxChange'
  | 'settingsSpectatorWaitlistEnabled'
  | 'onSettingsSpectatorWaitlistEnabledChange'
  | 'settingsSpectatorReconnectGraceSecs'
  | 'onSettingsSpectatorReconnectGraceSecsChange'
  | 'settingsPostSessionChatEnabled'
  | 'onSettingsPostSessionChatEnabledChange'
  | 'settingsPostSessionChatDurationMinutes'
  | 'onSettingsPostSessionChatDurationMinutesChange'
  | 'settingsExtensionSyncPolicy'
  | 'onSettingsExtensionSyncPolicyChange'
  | 'settingsExtensionInventorySyncEnabled'
  | 'onSettingsExtensionInventorySyncEnabledChange'
  | 'settingsExtensionCurrencySyncEnabled'
  | 'onSettingsExtensionCurrencySyncEnabledChange'
  | 'settingsExtensionPartyInventorySyncAccess'
  | 'onSettingsExtensionPartyInventorySyncAccessChange'
  | 'settingsExtensionSyncConflictResolution'
  | 'onSettingsExtensionSyncConflictResolutionChange'
  | 'settingsLateJoinPolicy'
  | 'onSettingsLateJoinPolicyChange'
  | 'settingsLateJoinGraceMinutes'
  | 'onSettingsLateJoinGraceMinutesChange'
  | 'showReissueInviteModal'
  | 'onCloseReissueInviteModal'
  | 'reissueInviteType'
  | 'onConfirmReissueInvite'
>

export const LobbyModals = memo(function LobbyModals(props: LobbyModalsProps) {
  return (
    <>
      <CreateCampaignModal
        showCreateCampaignModal={props.showCreateCampaignModal}
        user={props.user}
        newCampaignName={props.newCampaignName}
        isCreatingCampaign={props.isCreatingCampaign}
        pendingImportBundle={props.pendingImportBundle}
        conflictCampaign={props.conflictCampaign}
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
        settingsExtensionInventorySyncEnabled={props.settingsExtensionInventorySyncEnabled}
        onSettingsExtensionInventorySyncEnabledChange={
          props.onSettingsExtensionInventorySyncEnabledChange
        }
        settingsExtensionCurrencySyncEnabled={props.settingsExtensionCurrencySyncEnabled}
        onSettingsExtensionCurrencySyncEnabledChange={
          props.onSettingsExtensionCurrencySyncEnabledChange
        }
        settingsExtensionPartyInventorySyncAccess={
          props.settingsExtensionPartyInventorySyncAccess
        }
        onSettingsExtensionPartyInventorySyncAccessChange={
          props.onSettingsExtensionPartyInventorySyncAccessChange
        }
        settingsExtensionSyncConflictResolution={props.settingsExtensionSyncConflictResolution}
        onSettingsExtensionSyncConflictResolutionChange={
          props.onSettingsExtensionSyncConflictResolutionChange
        }
        settingsLateJoinPolicy={props.settingsLateJoinPolicy}
        onSettingsLateJoinPolicyChange={props.onSettingsLateJoinPolicyChange}
        settingsLateJoinGraceMinutes={props.settingsLateJoinGraceMinutes}
        onSettingsLateJoinGraceMinutesChange={props.onSettingsLateJoinGraceMinutesChange}
      />

      <ReissueInviteModal
        showReissueInviteModal={props.showReissueInviteModal}
        onCloseReissueInviteModal={props.onCloseReissueInviteModal}
        reissueInviteType={props.reissueInviteType}
        isInviteReissuing={props.isInviteReissuing}
        onConfirmReissueInvite={props.onConfirmReissueInvite}
      />
    </>
  )
})
