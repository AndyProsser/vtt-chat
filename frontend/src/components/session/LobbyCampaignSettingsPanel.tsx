import { TooltipProvider } from '../../core-ui'
import { LobbyCampaignSettingsPanelInvites } from './LobbyCampaignSettingsPanel.Invites'
import { LobbyCampaignSettingsPanelPolicy } from './LobbyCampaignSettingsPanel.Policy'
import type { LobbyCampaignSettingsPanelProps } from './LobbyCampaignSettingsPanel.types'

export function LobbyCampaignSettingsPanel(props: LobbyCampaignSettingsPanelProps) {
  const playerInviteUrl = props.settingsData
    ? `${window.location.origin}/join/${encodeURIComponent(props.settingsData.inviteCode)}`
    : ''
  const spectatorInviteUrl =
    props.settingsSpectatorsEnabled && props.settingsData?.spectatorInviteCode
      ? `${window.location.origin}/watch/${encodeURIComponent(props.settingsData.spectatorInviteCode)}`
      : ''

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
              All campaign configuration surfaces for {props.campaignName || 'this campaign'}.
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
          <div className="session-campaign-settings-column">
            <section className="session-campaign-settings-panel">
              <h5 className="session-inline-form-title">Campaign Profile</h5>

              <label className="session-label" htmlFor="workspace-campaign-settings-name">
                Name
              </label>
              <input
                id="workspace-campaign-settings-name"
                className="session-input"
                type="text"
                value={props.settingsName}
                onChange={(event) => props.onSettingsNameChange(event.target.value)}
                disabled={props.isSaving}
                required
              />

              <label className="session-label" htmlFor="workspace-campaign-settings-description">
                Description
              </label>
              <textarea
                id="workspace-campaign-settings-description"
                className="session-textarea"
                value={props.settingsDescription}
                onChange={(event) => props.onSettingsDescriptionChange(event.target.value)}
                rows={4}
                disabled={props.isSaving}
              />

              <label className="session-label" htmlFor="workspace-campaign-settings-poster-file">
                Upload poster
              </label>
              <input
                id="workspace-campaign-settings-poster-file"
                className="session-input"
                type="file"
                accept="image/*"
                onChange={props.onPosterFileSelected}
                disabled={props.isSaving}
              />

              <label className="session-label" htmlFor="workspace-campaign-settings-poster-url">
                Poster URL / Data URL
              </label>
              <input
                id="workspace-campaign-settings-poster-url"
                className="session-input"
                type="text"
                value={props.settingsPosterUrl}
                onChange={(event) => props.onSettingsPosterUrlChange(event.target.value)}
                disabled={props.isSaving}
              />

              <div className="session-action-row session-action-row--right">
                <button
                  type="button"
                  className="session-button session-button-neutral"
                  onClick={props.onRemovePoster}
                  disabled={props.isSaving || !props.settingsPosterUrl.trim()}
                >
                  Remove Poster
                </button>
              </div>
            </section>

            <LobbyCampaignSettingsPanelInvites
              isInviteReissuing={props.isInviteReissuing}
              settingsSpectatorsEnabled={props.settingsSpectatorsEnabled}
              hasSpectatorInviteCode={Boolean(props.settingsData.spectatorInviteCode)}
              playerInviteUrl={playerInviteUrl}
              spectatorInviteUrl={spectatorInviteUrl}
              onCopyInviteUrl={props.onCopyInviteUrl}
              onReissueInvite={props.onReissueInvite}
            />
          </div>

          <LobbyCampaignSettingsPanelPolicy
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
