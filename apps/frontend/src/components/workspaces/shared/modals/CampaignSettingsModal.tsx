import { memo } from 'react'
import type { UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { CampaignScaffoldPanel } from '@/components/workspaces/shared/panels/CampaignScaffoldPanel'
import type { ModalsProps } from '@/types/modals'
import { CampaignSettingsHomeContent } from './CampaignSettingsHomeContent'

type CampaignSettingsModalProps = Pick<
  ModalsProps,
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
>

export const CampaignSettingsModal = memo(function CampaignSettingsModal(
  props: CampaignSettingsModalProps
) {
  if (!props.showCampaignSettingsModal) {
    return null
  }

  return (
    <div className="session-modal-backdrop" role="presentation">
      <div
        className="session-modal session-campaign-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Campaign settings"
      >
        <div className="session-campaign-settings-header">
          <div>
            <h4 className="session-inline-form-title session-inline-form-title--with-icon">
              <Icon name="settings" />
              <span>Campaign Settings</span>
            </h4>
            <p className="session-card-subtitle">
              Manage metadata, poster, and invite links from the lobby.
            </p>
          </div>
          <div className="session-campaign-settings-header__actions">
            <button
              type="submit"
              form="campaign-settings-form"
              className="session-icon-action"
              aria-label={props.isSettingsSaving ? 'Saving settings' : 'Save settings'}
              disabled={
                props.settingsHomeTab !== 'home' ||
                props.isSettingsSaving ||
                !props.settingsData ||
                !props.settingsName.trim()
              }
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {props.isSettingsSaving ? 'hourglass_top' : 'save'}
              </span>
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="session-icon-action"
                  aria-label="Close settings"
                  onClick={props.onCloseCampaignSettings}
                >
                  <Icon name="close" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close settings</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div
          className="session-campaign-settings-tabs"
          role="tablist"
          aria-label="Settings home tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={props.settingsHomeTab === 'home'}
            className={`session-campaign-settings-tab ${props.settingsHomeTab === 'home' ? 'is-active' : ''}`}
            onClick={() => props.onSettingsHomeTabChange('home')}
          >
            Home
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.settingsHomeTab === 'notes'}
            className={`session-campaign-settings-tab ${props.settingsHomeTab === 'notes' ? 'is-active' : ''}`}
            onClick={() => props.onSettingsHomeTabChange('notes')}
            disabled={!props.settingsReferenceSessionId}
          >
            Notes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={props.settingsHomeTab === 'journal'}
            className={`session-campaign-settings-tab ${props.settingsHomeTab === 'journal' ? 'is-active' : ''}`}
            onClick={() => props.onSettingsHomeTabChange('journal')}
            disabled={!props.settingsReferenceSessionId}
          >
            Journal
          </button>
        </div>

        {props.settingsHomeTab === 'journal' && props.settingsCampaignSessions.length > 0 ? (
          <div className="session-campaign-settings-session-context">
            <label className="session-label" htmlFor="settings-session-context">
              Session context
            </label>
            <select
              id="settings-session-context"
              className="session-input"
              value={props.settingsReferenceSessionId}
              onChange={(event) =>
                props.onSettingsReferenceSessionChange(event.target.value as UUID)
              }
              disabled={!props.settingsCampaignSessions.length}
            >
              {props.settingsCampaignSessions.length === 0 ? (
                <option value="">No sessions available</option>
              ) : (
                [...props.settingsCampaignSessions].reverse().map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} ({new Date(session.createdAt).toLocaleDateString()})
                  </option>
                ))
              )}
            </select>
            {props.settingsReferenceSession ? (
              <p className="session-card-subtitle">
                Working in {props.settingsReferenceSession.name} (
                {props.settingsReferenceSession.id}).
              </p>
            ) : null}
          </div>
        ) : null}

        {props.isSettingsLoading ? (
          <div className="workspaces-status-message">Loading campaign settings...</div>
        ) : !props.settingsData ? (
          <div className="workspaces-status-message">Unable to load campaign settings.</div>
        ) : props.settingsHomeTab === 'notes' ? (
          <CampaignScaffoldPanel
            title="Campaign Notes"
            subtitle="Notes are being transitioned to campaign-scoped authoring and sharing."
            sections={[
              'Campaign notebook landing view',
              'Handout permissions and targeting',
              'Pinned references and templates',
            ]}
            campaignName={props.selectedCampaignName}
          />
        ) : props.settingsHomeTab === 'journal' ? (
          <CampaignScaffoldPanel
            title="Campaign Journal"
            subtitle={
              props.settingsReferenceSessionId
                ? `Session context available: ${props.settingsReferenceSession?.name || props.settingsReferenceSessionId}`
                : 'No session context selected yet.'
            }
            sections={[
              'Session recap flow and timeline anchors',
              'DM editing guardrails',
              'Player/spectator read visibility',
            ]}
            campaignName={props.selectedCampaignName}
          />
        ) : (
          <CampaignSettingsHomeContent
            selectedCampaignName={props.selectedCampaignName}
            onSaveCampaignSettings={props.onSaveCampaignSettings}
            settingsName={props.settingsName}
            onSettingsNameChange={props.onSettingsNameChange}
            settingsDescription={props.settingsDescription}
            onSettingsDescriptionChange={props.onSettingsDescriptionChange}
            onPosterFileSelected={props.onPosterFileSelected}
            isSettingsSaving={props.isSettingsSaving}
            onCopyInviteUrl={props.onCopyInviteUrl}
            onReissueInvite={props.onReissueInvite}
            isInviteReissuing={props.isInviteReissuing}
            settingsVisibility={props.settingsVisibility}
            onSettingsVisibilityChange={props.onSettingsVisibilityChange}
            settingsSpectatorsEnabled={props.settingsSpectatorsEnabled}
            onSettingsSpectatorsEnabledChange={props.onSettingsSpectatorsEnabledChange}
            settingsSpectatorMax={props.settingsSpectatorMax}
            onSettingsSpectatorMaxChange={props.onSettingsSpectatorMaxChange}
            settingsSpectatorWaitlistEnabled={props.settingsSpectatorWaitlistEnabled}
            onSettingsSpectatorWaitlistEnabledChange={
              props.onSettingsSpectatorWaitlistEnabledChange
            }
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
            settingsData={props.settingsData}
          />
        )}
      </div>
    </div>
  )
})
