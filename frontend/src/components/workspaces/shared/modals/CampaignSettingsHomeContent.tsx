import { Slider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { CampaignScaffoldPanel } from '@/components/workspaces/shared/panels/CampaignScaffoldPanel'
import { getLateJoinPolicyLabel, LATE_JOIN_POLICY_OPTIONS } from '@/constants/sessionUi.constants'
import type { ModalsProps } from '@/types/modals'

type CampaignSettingsHomeContentProps = Pick<
  ModalsProps,
  | 'selectedCampaignName'
  | 'onSaveCampaignSettings'
  | 'settingsName'
  | 'onSettingsNameChange'
  | 'settingsDescription'
  | 'onSettingsDescriptionChange'
  | 'onPosterFileSelected'
  | 'isSettingsSaving'
  | 'onCopyInviteUrl'
  | 'onReissueInvite'
  | 'isInviteReissuing'
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
  | 'settingsLateJoinPolicy'
  | 'onSettingsLateJoinPolicyChange'
  | 'settingsLateJoinGraceMinutes'
  | 'onSettingsLateJoinGraceMinutesChange'
  | 'settingsData'
>

export function CampaignSettingsHomeContent(props: CampaignSettingsHomeContentProps) {
  const playerInviteUrl = props.settingsData
    ? `${window.location.origin}/join/${encodeURIComponent(props.settingsData.inviteCode)}`
    : ''
  const spectatorInviteUrl =
    props.settingsSpectatorsEnabled && props.settingsData?.spectatorInviteCode
      ? `${window.location.origin}/watch/${encodeURIComponent(props.settingsData.spectatorInviteCode)}`
      : ''

  return (
    <div className="session-campaign-settings-grid session-campaign-settings-grid-dialog">
      <div className="session-campaign-settings-column">
        <CampaignScaffoldPanel
          title="Campaign Overview"
          subtitle="Home now focuses on campaign metadata and policy, not session snapshots."
          sections={[
            'Campaign profile and branding',
            'Invite and visibility controls',
            'Participation and access policy',
          ]}
          campaignName={props.selectedCampaignName}
        />

        <form
          id="campaign-settings-form"
          className="session-campaign-settings-panel"
          onSubmit={props.onSaveCampaignSettings}
        >
          <h5 className="session-inline-form-title">Campaign Profile</h5>

          <label className="session-label" htmlFor="campaign-settings-name">
            Name
          </label>
          <input
            id="campaign-settings-name"
            className="session-input"
            type="text"
            value={props.settingsName}
            onChange={(event) => props.onSettingsNameChange(event.target.value)}
            disabled={props.isSettingsSaving}
            required
          />

          <label className="session-label" htmlFor="campaign-settings-description">
            Description
          </label>
          <textarea
            id="campaign-settings-description"
            className="session-textarea"
            value={props.settingsDescription}
            onChange={(event) => props.onSettingsDescriptionChange(event.target.value)}
            rows={4}
            disabled={props.isSettingsSaving}
          />

          <label className="session-label" htmlFor="campaign-settings-poster-file">
            Upload poster
          </label>
          <input
            id="campaign-settings-poster-file"
            className="session-input"
            type="file"
            accept="image/*"
            onChange={props.onPosterFileSelected}
            disabled={props.isSettingsSaving}
          />

          <p className="session-card-subtitle">
            Poster appears muted behind the campaign card so text remains readable.
          </p>
        </form>

        <section
          className="session-campaign-settings-panel session-campaign-invite-panel"
          aria-label="Invite links"
        >
          <h5 className="session-inline-form-title">Invite Links</h5>
          <div className="session-invite-link-row">
            <div className="session-invite-link-row__label">Player</div>
            <div className="session-invite-link-row__input-wrap">
              <input
                className="session-invite-link-row__input"
                type="text"
                readOnly
                value={playerInviteUrl}
                aria-label="Player invite URL"
              />
            </div>
            <div className="session-invite-link-row__actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action"
                    aria-label="Copy player invite URL"
                    onClick={() => props.onCopyInviteUrl('PLAYER')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      content_copy
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Copy player invite URL</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action"
                    aria-label="Refresh player invite URL"
                    disabled={props.isInviteReissuing}
                    onClick={() => props.onReissueInvite('PLAYER')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      refresh
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Refresh player invite URL</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="session-invite-link-row">
            <div className="session-invite-link-row__label">Spectator</div>
            <div className="session-invite-link-row__input-wrap">
              <input
                className="session-invite-link-row__input"
                type="text"
                readOnly
                value={spectatorInviteUrl}
                aria-label="Spectator invite URL"
                disabled={!props.settingsSpectatorsEnabled}
              />
            </div>
            <div className="session-invite-link-row__actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action"
                    aria-label="Copy spectator invite URL"
                    disabled={
                      !props.settingsSpectatorsEnabled || !props.settingsData?.spectatorInviteCode
                    }
                    onClick={() => props.onCopyInviteUrl('SPECTATOR')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      content_copy
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Copy spectator invite URL</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="session-icon-action"
                    aria-label="Refresh spectator invite URL"
                    disabled={!props.settingsSpectatorsEnabled || props.isInviteReissuing}
                    onClick={() => props.onReissueInvite('SPECTATOR')}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      refresh
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">Refresh spectator invite URL</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </section>
      </div>

      <section
        className="session-campaign-settings-panel session-campaign-settings-panel--compact"
        aria-label="Campaign settings controls"
      >
        <h5 className="session-inline-form-title">Settings</h5>
        <label className="session-label" htmlFor="campaign-settings-visibility">
          Visibility
        </label>
        <div className="session-toggle-group" role="group" aria-label="Visibility">
          <button
            type="button"
            className={`session-toggle-button ${props.settingsVisibility === 'PUBLIC' ? 'is-active' : ''}`}
            aria-pressed={props.settingsVisibility === 'PUBLIC'}
            onClick={() => props.onSettingsVisibilityChange('PUBLIC')}
            disabled={props.isSettingsSaving}
          >
            Public
          </button>
          <button
            type="button"
            className={`session-toggle-button ${props.settingsVisibility === 'PRIVATE' ? 'is-active' : ''}`}
            aria-pressed={props.settingsVisibility === 'PRIVATE'}
            onClick={() => props.onSettingsVisibilityChange('PRIVATE')}
            disabled={props.isSettingsSaving}
          >
            Private
          </button>
        </div>

        <label className="session-label" htmlFor="campaign-settings-spectators">
          Spectators
        </label>
        <div className="session-toggle-group" role="group" aria-label="Spectators">
          <button
            type="button"
            className={`session-toggle-button ${props.settingsSpectatorsEnabled ? 'is-active' : ''}`}
            aria-pressed={props.settingsSpectatorsEnabled}
            onClick={() => props.onSettingsSpectatorsEnabledChange(true)}
            disabled={props.isSettingsSaving}
          >
            ON
          </button>
          <button
            type="button"
            className={`session-toggle-button ${!props.settingsSpectatorsEnabled ? 'is-active' : ''}`}
            aria-pressed={!props.settingsSpectatorsEnabled}
            onClick={() => props.onSettingsSpectatorsEnabledChange(false)}
            disabled={props.isSettingsSaving}
          >
            OFF
          </button>
        </div>

        <label className="session-label" htmlFor="campaign-settings-spectator-max">
          Max spectators: {props.settingsSpectatorMax}
        </label>
        <Slider
          id="campaign-settings-spectator-max"
          className="session-slider"
          min={5}
          max={50}
          step={5}
          value={props.settingsSpectatorMax}
          onValueChange={(nextValue) => props.onSettingsSpectatorMaxChange(nextValue)}
          disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
        />

        <label className="session-label" htmlFor="campaign-settings-waitlist">
          Spectator waitlist
        </label>
        <div className="session-toggle-group" role="group" aria-label="Spectator waitlist">
          <button
            type="button"
            className={`session-toggle-button ${props.settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
            aria-pressed={props.settingsSpectatorWaitlistEnabled}
            onClick={() => props.onSettingsSpectatorWaitlistEnabledChange(true)}
            disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
          >
            ON
          </button>
          <button
            type="button"
            className={`session-toggle-button ${!props.settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
            aria-pressed={!props.settingsSpectatorWaitlistEnabled}
            onClick={() => props.onSettingsSpectatorWaitlistEnabledChange(false)}
            disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
          >
            OFF
          </button>
        </div>

        <label className="session-label" htmlFor="campaign-settings-reconnect-grace">
          Spectator reconnect grace (seconds): {props.settingsSpectatorReconnectGraceSecs}
        </label>
        <Slider
          id="campaign-settings-reconnect-grace"
          className="session-slider"
          min={30}
          max={90}
          step={5}
          value={props.settingsSpectatorReconnectGraceSecs}
          onValueChange={(nextValue) =>
            props.onSettingsSpectatorReconnectGraceSecsChange(nextValue)
          }
          disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
        />

        <label className="session-label" htmlFor="campaign-settings-post-session-chat">
          Post-session spectator chat
        </label>
        <div className="session-toggle-group" role="group" aria-label="Post-session spectator chat">
          <button
            type="button"
            className={`session-toggle-button ${props.settingsPostSessionChatEnabled ? 'is-active' : ''}`}
            aria-pressed={props.settingsPostSessionChatEnabled}
            onClick={() => props.onSettingsPostSessionChatEnabledChange(true)}
            disabled={props.isSettingsSaving}
          >
            ON
          </button>
          <button
            type="button"
            className={`session-toggle-button ${!props.settingsPostSessionChatEnabled ? 'is-active' : ''}`}
            aria-pressed={!props.settingsPostSessionChatEnabled}
            onClick={() => props.onSettingsPostSessionChatEnabledChange(false)}
            disabled={props.isSettingsSaving}
          >
            OFF
          </button>
        </div>

        <label className="session-label" htmlFor="campaign-settings-post-session-duration">
          Post-session duration: {props.settingsPostSessionChatDurationMinutes} min
        </label>
        <Slider
          id="campaign-settings-post-session-duration"
          className="session-slider"
          min={1}
          max={15}
          step={1}
          value={props.settingsPostSessionChatDurationMinutes}
          onValueChange={(nextValue) =>
            props.onSettingsPostSessionChatDurationMinutesChange(nextValue)
          }
          disabled={props.isSettingsSaving || !props.settingsPostSessionChatEnabled}
        />
        <p className="session-card-subtitle">
          Default 5 minutes. Minimum 1 minute, maximum 15 minutes.
        </p>

        <label className="session-label" htmlFor="campaign-settings-extension-sync-policy">
          Extension sync policy
        </label>
        <div className="session-toggle-group" role="group" aria-label="Extension sync policy">
          <button
            type="button"
            className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'ALLOW' ? 'is-active' : ''}`}
            aria-pressed={props.settingsExtensionSyncPolicy === 'ALLOW'}
            onClick={() => props.onSettingsExtensionSyncPolicyChange('ALLOW')}
            disabled={props.isSettingsSaving}
          >
            ALLOW
          </button>
          <button
            type="button"
            className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'DM_ONLY' ? 'is-active' : ''}`}
            aria-pressed={props.settingsExtensionSyncPolicy === 'DM_ONLY'}
            onClick={() => props.onSettingsExtensionSyncPolicyChange('DM_ONLY')}
            disabled={props.isSettingsSaving}
          >
            DM_ONLY
          </button>
          <button
            type="button"
            className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'NONE' ? 'is-active' : ''}`}
            aria-pressed={props.settingsExtensionSyncPolicy === 'NONE'}
            onClick={() => props.onSettingsExtensionSyncPolicyChange('NONE')}
            disabled={props.isSettingsSaving}
          >
            NONE
          </button>
        </div>

        <label className="session-label" htmlFor="campaign-settings-late-join-policy">
          Late join policy
        </label>
        <div className="session-toggle-group" role="group" aria-label="Late join policy">
          {LATE_JOIN_POLICY_OPTIONS.map((policy) => (
            <button
              key={policy}
              type="button"
              className={`session-toggle-button ${props.settingsLateJoinPolicy === policy ? 'is-active' : ''}`}
              aria-pressed={props.settingsLateJoinPolicy === policy}
              onClick={() => props.onSettingsLateJoinPolicyChange(policy)}
              disabled={props.isSettingsSaving}
            >
              {getLateJoinPolicyLabel(policy)}
            </button>
          ))}
        </div>

        <label className="session-label" htmlFor="campaign-settings-late-join-grace">
          Late join grace (minutes): {props.settingsLateJoinGraceMinutes}
        </label>
        <Slider
          id="campaign-settings-late-join-grace"
          className="session-slider"
          min={30}
          max={90}
          step={10}
          value={props.settingsLateJoinGraceMinutes}
          onValueChange={(nextValue) => props.onSettingsLateJoinGraceMinutesChange(nextValue)}
          disabled={props.isSettingsSaving || props.settingsLateJoinPolicy === 'OPEN'}
        />
      </section>
    </div>
  )
}
