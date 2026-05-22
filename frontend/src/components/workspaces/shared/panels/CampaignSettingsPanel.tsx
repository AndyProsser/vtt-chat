import { TooltipProvider } from '@/components/ui'
import { CampaignSettingsPanelPolicy } from './CampaignSettingsPanel.Policy'
import type { CampaignSettingsPanelProps } from '@/types/campaignSettingsPanel'

export function CampaignSettingsPanel(props: CampaignSettingsPanelProps) {
  if (props.isLoading) {
    return <div className="session-status-message">Loading campaign settings...</div>
  }

  if (!props.settingsData) {
    return <div className="session-status-message">Unable to load campaign settings.</div>
  }

  return (
    <TooltipProvider delayDuration={140}>
      <section
        className="session-campaign-settings-panel session-campaign-settings-workspace-root"
        aria-label="Campaign settings workspace"
      >
        <div className="session-campaign-settings-header">
          <div>
            <h4 className="session-inline-form-title">Campaign Settings</h4>
            <p className="session-card-subtitle">
              Policy controls for {props.campaignName || 'this campaign'}.
            </p>
          </div>
          <button
            type="button"
            className="session-icon-action"
            aria-label={props.isSaving ? 'Saving settings' : 'Save settings'}
            disabled={props.isSaving || !props.settingsName.trim()}
            onClick={props.onSave}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {props.isSaving ? 'hourglass_top' : 'save'}
            </span>
          </button>
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
          />
        </div>
      </section>
    </TooltipProvider>
  )
}
