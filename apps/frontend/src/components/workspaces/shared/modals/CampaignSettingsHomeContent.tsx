import { Slider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { CampaignScaffoldPanel } from '@/components/workspaces/shared/panels/CampaignScaffoldPanel'
import {
  CAMPAIGN_VISIBILITY_OPTIONS,
  EXTENSION_CONFLICT_RESOLUTION_OPTIONS,
  EXTENSION_PARTY_ACCESS_OPTIONS,
  EXTENSION_SYNC_POLICY_OPTIONS,
  getBooleanToggleLabel,
  getCampaignVisibilityLabel,
  getExtensionConflictResolutionLabel,
  getExtensionPartyAccessLabel,
  getExtensionSyncPolicyLabel,
  getLateJoinPolicyLabel,
  LATE_JOIN_POLICY_OPTIONS,
} from '@/constants/sessionUi.constants'
import type {
  ExtensionPartyInventorySyncAccess,
  ExtensionSyncConflictResolution,
} from '@/types/sessionUi'
import type { ModalsProps } from '@/types/modals'
import { Icon } from '@/components/ui/Icon'

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
                    <Icon name="content_copy" />
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
                    <Icon name="refresh" />
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
                    <Icon name="content_copy" />
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
                    <Icon name="refresh" />
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
          {CAMPAIGN_VISIBILITY_OPTIONS.map((visibility) => (
            <button
              key={visibility}
              type="button"
              className={`session-toggle-button ${props.settingsVisibility === visibility ? 'is-active' : ''}`}
              aria-pressed={props.settingsVisibility === visibility}
              onClick={() => props.onSettingsVisibilityChange(visibility)}
              disabled={props.isSettingsSaving}
            >
              {getCampaignVisibilityLabel(visibility)}
            </button>
          ))}
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
            {getBooleanToggleLabel(true)}
          </button>
          <button
            type="button"
            className={`session-toggle-button ${!props.settingsSpectatorsEnabled ? 'is-active' : ''}`}
            aria-pressed={!props.settingsSpectatorsEnabled}
            onClick={() => props.onSettingsSpectatorsEnabledChange(false)}
            disabled={props.isSettingsSaving}
          >
            {getBooleanToggleLabel(false)}
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
            {getBooleanToggleLabel(true)}
          </button>
          <button
            type="button"
            className={`session-toggle-button ${!props.settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
            aria-pressed={!props.settingsSpectatorWaitlistEnabled}
            onClick={() => props.onSettingsSpectatorWaitlistEnabledChange(false)}
            disabled={props.isSettingsSaving || !props.settingsSpectatorsEnabled}
          >
            {getBooleanToggleLabel(false)}
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
            {getBooleanToggleLabel(true)}
          </button>
          <button
            type="button"
            className={`session-toggle-button ${!props.settingsPostSessionChatEnabled ? 'is-active' : ''}`}
            aria-pressed={!props.settingsPostSessionChatEnabled}
            onClick={() => props.onSettingsPostSessionChatEnabledChange(false)}
            disabled={props.isSettingsSaving}
          >
            {getBooleanToggleLabel(false)}
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
          {EXTENSION_SYNC_POLICY_OPTIONS.map((policy) => (
            <button
              key={policy}
              type="button"
              className={`session-toggle-button ${props.settingsExtensionSyncPolicy === policy ? 'is-active' : ''}`}
              aria-pressed={props.settingsExtensionSyncPolicy === policy}
              onClick={() => props.onSettingsExtensionSyncPolicyChange(policy)}
              disabled={props.isSettingsSaving}
            >
              {getExtensionSyncPolicyLabel(policy)}
            </button>
          ))}
        </div>

        {props.settingsExtensionSyncPolicy !== 'NONE' && (
          <>
            <label className="session-label" htmlFor="campaign-settings-inventory-sync">
              Inventory sync
            </label>
            <div className="session-toggle-group" role="group" aria-label="Inventory sync">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  className={`session-toggle-button ${props.settingsExtensionInventorySyncEnabled === v ? 'is-active' : ''}`}
                  aria-pressed={props.settingsExtensionInventorySyncEnabled === v}
                  onClick={() => props.onSettingsExtensionInventorySyncEnabledChange(v)}
                  disabled={props.isSettingsSaving}
                >
                  {getBooleanToggleLabel(v)}
                </button>
              ))}
            </div>

            <label className="session-label" htmlFor="campaign-settings-currency-sync">
              Currency sync
            </label>
            <div className="session-toggle-group" role="group" aria-label="Currency sync">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  className={`session-toggle-button ${props.settingsExtensionCurrencySyncEnabled === v ? 'is-active' : ''}`}
                  aria-pressed={props.settingsExtensionCurrencySyncEnabled === v}
                  onClick={() => props.onSettingsExtensionCurrencySyncEnabledChange(v)}
                  disabled={props.isSettingsSaving}
                >
                  {getBooleanToggleLabel(v)}
                </button>
              ))}
            </div>

            <label className="session-label" htmlFor="campaign-settings-party-inventory-access">
              Party inventory access
            </label>
            <div className="session-toggle-group" role="group" aria-label="Party inventory access">
              {EXTENSION_PARTY_ACCESS_OPTIONS.map((access: ExtensionPartyInventorySyncAccess) => (
                <button
                  key={access}
                  type="button"
                  className={`session-toggle-button ${props.settingsExtensionPartyInventorySyncAccess === access ? 'is-active' : ''}`}
                  aria-pressed={props.settingsExtensionPartyInventorySyncAccess === access}
                  onClick={() => props.onSettingsExtensionPartyInventorySyncAccessChange(access)}
                  disabled={props.isSettingsSaving}
                >
                  {getExtensionPartyAccessLabel(access)}
                </button>
              ))}
            </div>

            <label className="session-label" htmlFor="campaign-settings-conflict-resolution">
              Conflict resolution
            </label>
            <div className="session-toggle-group" role="group" aria-label="Conflict resolution">
              {EXTENSION_CONFLICT_RESOLUTION_OPTIONS.map(
                (resolution: ExtensionSyncConflictResolution) => (
                  <button
                    key={resolution}
                    type="button"
                    className={`session-toggle-button ${props.settingsExtensionSyncConflictResolution === resolution ? 'is-active' : ''}`}
                    aria-pressed={props.settingsExtensionSyncConflictResolution === resolution}
                    onClick={() =>
                      props.onSettingsExtensionSyncConflictResolutionChange(resolution)
                    }
                    disabled={props.isSettingsSaving}
                  >
                    {getExtensionConflictResolutionLabel(resolution)}
                  </button>
                )
              )}
            </div>
          </>
        )}

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
