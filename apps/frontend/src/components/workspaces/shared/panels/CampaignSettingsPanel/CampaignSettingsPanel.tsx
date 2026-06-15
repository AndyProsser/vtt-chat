import { TooltipProvider } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { CampaignSettingsPanelPolicy } from './Policy'
import { DeleteCampaignSection } from './DeleteCampaignSection'
import type { CampaignSettingsPanelProps } from '@/types/campaignSettingsPanel'

export function CampaignSettingsPanel(props: CampaignSettingsPanelProps) {
  if (props.isLoading) {
    return <div className="workspaces-status-message">Loading campaign settings...</div>
  }

  if (!props.settingsData) {
    return <div className="workspaces-status-message">Unable to load campaign settings.</div>
  }

  return (
    <TooltipProvider delayDuration={140}>
      <section
        className="session-campaign-settings-panel session-campaign-settings-workspace-root"
        aria-label="Campaign settings workspace"
      >
        <div className="session-campaign-settings-header">
          <div>
            <h4 className="session-inline-form-title session-inline-form-title--with-icon">
              <Icon name="settings" />
              <span>Campaign Settings</span>
            </h4>
            <p className="session-card-subtitle">
              Policy controls for {props.campaignName || 'this campaign'}.
            </p>
          </div>
          <div className="session-inline-actions" aria-label="Campaign settings actions">
            <button
              type="button"
              className="session-icon-action session-icon-action--icon"
              aria-label="Export campaign"
              disabled={props.isSaving}
              onClick={props.onExport}
            >
              <Icon name="file_download" />
            </button>
            <button
              type="button"
              className="session-icon-action session-icon-action--icon"
              aria-label={props.isSaving ? 'Saving settings' : 'Save settings'}
              disabled={props.isSaving || !props.settingsName.trim()}
              onClick={props.onSave}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {props.isSaving ? 'hourglass_top' : 'save'}
              </span>
            </button>
          </div>
        </div>

        <div className="session-campaign-settings-grid session-campaign-settings-grid-dialog">
          <CampaignSettingsPanelPolicy
            isSaving={props.isSaving}
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
            settingsLateJoinPolicy={props.settingsLateJoinPolicy}
            onSettingsLateJoinPolicyChange={props.onSettingsLateJoinPolicyChange}
            settingsLateJoinGraceMinutes={props.settingsLateJoinGraceMinutes}
            onSettingsLateJoinGraceMinutesChange={props.onSettingsLateJoinGraceMinutesChange}
            settingsDmAutoTargetOnFirstPlayerJoin={props.settingsDmAutoTargetOnFirstPlayerJoin}
            onSettingsDmAutoTargetOnFirstPlayerJoinChange={
              props.onSettingsDmAutoTargetOnFirstPlayerJoinChange
            }
            settingsDefaultSessionDurationMins={props.settingsDefaultSessionDurationMins}
            onSettingsDefaultSessionDurationMinsChange={
              props.onSettingsDefaultSessionDurationMinsChange
            }
            settingsSupportedPlatforms={props.settingsSupportedPlatforms}
            onSettingsSupportedPlatformsChange={props.onSettingsSupportedPlatformsChange}
            sessionNameBase={props.sessionNameBase}
            onSessionNameBaseChange={props.onSessionNameBaseChange}
            sessionNameContext={props.sessionNameContext}
            isSessionActive={props.isSessionActive}
            isEditorContext={props.isEditorContext}
          />
          {props.sessionSettingsPanel}
        </div>

        <DeleteCampaignSection
          campaignName={props.campaignName || 'this campaign'}
          isDeleting={props.isDeletingCampaign}
          onDelete={props.onDeleteCampaign}
        />
      </section>
    </TooltipProvider>
  )
}
