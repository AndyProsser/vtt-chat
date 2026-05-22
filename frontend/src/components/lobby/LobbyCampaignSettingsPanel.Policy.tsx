import { Slider } from '@/components/ui'

type LobbyCampaignSettingsPanelPolicyProps = {
  isSaving: boolean
  settingsVisibility: 'PUBLIC' | 'PRIVATE'
  onSettingsVisibilityChange: (value: 'PUBLIC' | 'PRIVATE') => void
  settingsSpectatorsEnabled: boolean
  onSettingsSpectatorsEnabledChange: (value: boolean) => void
  settingsSpectatorMax: number
  onSettingsSpectatorMaxChange: (value: number) => void
  settingsSpectatorWaitlistEnabled: boolean
  onSettingsSpectatorWaitlistEnabledChange: (value: boolean) => void
  settingsSpectatorReconnectGraceSecs: number
  onSettingsSpectatorReconnectGraceSecsChange: (value: number) => void
  settingsPostSessionChatEnabled: boolean
  onSettingsPostSessionChatEnabledChange: (value: boolean) => void
  settingsPostSessionChatDurationMinutes: number
  onSettingsPostSessionChatDurationMinutesChange: (value: number) => void
  settingsExtensionSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
  onSettingsExtensionSyncPolicyChange: (value: 'ALLOW' | 'DM_ONLY' | 'NONE') => void
  settingsLateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  onSettingsLateJoinPolicyChange: (value: 'OPEN' | 'SCREENED' | 'BLOCKED') => void
  settingsLateJoinGraceMinutes: number
  onSettingsLateJoinGraceMinutesChange: (value: number) => void
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value: boolean) => void
}

export function LobbyCampaignSettingsPanelPolicy(props: LobbyCampaignSettingsPanelPolicyProps) {
  return (
    <section className="session-campaign-settings-panel" aria-label="Campaign policy settings">
      <h5 className="session-inline-form-title">Settings</h5>
      <label className="session-label" htmlFor="workspace-campaign-settings-visibility">
        Visibility
      </label>
      <div className="session-toggle-group" role="group" aria-label="Visibility">
        <button
          type="button"
          className={`session-toggle-button ${props.settingsVisibility === 'PUBLIC' ? 'is-active' : ''}`}
          aria-pressed={props.settingsVisibility === 'PUBLIC'}
          onClick={() => props.onSettingsVisibilityChange('PUBLIC')}
          disabled={props.isSaving}
        >
          Public
        </button>
        <button
          type="button"
          className={`session-toggle-button ${props.settingsVisibility === 'PRIVATE' ? 'is-active' : ''}`}
          aria-pressed={props.settingsVisibility === 'PRIVATE'}
          onClick={() => props.onSettingsVisibilityChange('PRIVATE')}
          disabled={props.isSaving}
        >
          Private
        </button>
      </div>

      <label className="session-label" htmlFor="workspace-campaign-settings-spectators">
        Spectators
      </label>
      <div className="session-toggle-group" role="group" aria-label="Spectators">
        <button
          type="button"
          className={`session-toggle-button ${props.settingsSpectatorsEnabled ? 'is-active' : ''}`}
          aria-pressed={props.settingsSpectatorsEnabled}
          onClick={() => props.onSettingsSpectatorsEnabledChange(true)}
          disabled={props.isSaving}
        >
          ON
        </button>
        <button
          type="button"
          className={`session-toggle-button ${!props.settingsSpectatorsEnabled ? 'is-active' : ''}`}
          aria-pressed={!props.settingsSpectatorsEnabled}
          onClick={() => props.onSettingsSpectatorsEnabledChange(false)}
          disabled={props.isSaving}
        >
          OFF
        </button>
      </div>

      <label className="session-label" htmlFor="workspace-campaign-settings-spectator-max">
        Max spectators: {props.settingsSpectatorMax}
      </label>
      <Slider
        id="workspace-campaign-settings-spectator-max"
        className="session-slider"
        min={5}
        max={50}
        step={5}
        value={props.settingsSpectatorMax}
        onValueChange={(nextValue) => props.onSettingsSpectatorMaxChange(nextValue)}
        disabled={props.isSaving || !props.settingsSpectatorsEnabled}
      />

      <label className="session-label" htmlFor="workspace-campaign-settings-waitlist">
        Spectator waitlist
      </label>
      <div className="session-toggle-group" role="group" aria-label="Spectator waitlist">
        <button
          type="button"
          className={`session-toggle-button ${props.settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
          aria-pressed={props.settingsSpectatorWaitlistEnabled}
          onClick={() => props.onSettingsSpectatorWaitlistEnabledChange(true)}
          disabled={props.isSaving || !props.settingsSpectatorsEnabled}
        >
          ON
        </button>
        <button
          type="button"
          className={`session-toggle-button ${!props.settingsSpectatorWaitlistEnabled ? 'is-active' : ''}`}
          aria-pressed={!props.settingsSpectatorWaitlistEnabled}
          onClick={() => props.onSettingsSpectatorWaitlistEnabledChange(false)}
          disabled={props.isSaving || !props.settingsSpectatorsEnabled}
        >
          OFF
        </button>
      </div>

      <label className="session-label" htmlFor="workspace-campaign-settings-reconnect-grace">
        Spectator reconnect grace (seconds): {props.settingsSpectatorReconnectGraceSecs}
      </label>
      <Slider
        id="workspace-campaign-settings-reconnect-grace"
        className="session-slider"
        min={30}
        max={90}
        step={5}
        value={props.settingsSpectatorReconnectGraceSecs}
        onValueChange={(nextValue) => props.onSettingsSpectatorReconnectGraceSecsChange(nextValue)}
        disabled={props.isSaving || !props.settingsSpectatorsEnabled}
      />

      <label className="session-label" htmlFor="workspace-campaign-settings-post-session-chat">
        Post-session spectator chat
      </label>
      <div className="session-toggle-group" role="group" aria-label="Post-session spectator chat">
        <button
          type="button"
          className={`session-toggle-button ${props.settingsPostSessionChatEnabled ? 'is-active' : ''}`}
          aria-pressed={props.settingsPostSessionChatEnabled}
          onClick={() => props.onSettingsPostSessionChatEnabledChange(true)}
          disabled={props.isSaving}
        >
          ON
        </button>
        <button
          type="button"
          className={`session-toggle-button ${!props.settingsPostSessionChatEnabled ? 'is-active' : ''}`}
          aria-pressed={!props.settingsPostSessionChatEnabled}
          onClick={() => props.onSettingsPostSessionChatEnabledChange(false)}
          disabled={props.isSaving}
        >
          OFF
        </button>
      </div>

      <label className="session-label" htmlFor="workspace-campaign-settings-post-session-duration">
        Post-session duration: {props.settingsPostSessionChatDurationMinutes} min
      </label>
      <Slider
        id="workspace-campaign-settings-post-session-duration"
        className="session-slider"
        min={1}
        max={15}
        step={1}
        value={props.settingsPostSessionChatDurationMinutes}
        onValueChange={(nextValue) =>
          props.onSettingsPostSessionChatDurationMinutesChange(nextValue)
        }
        disabled={props.isSaving || !props.settingsPostSessionChatEnabled}
      />

      <label className="session-label" htmlFor="workspace-campaign-settings-extension-sync-policy">
        Extension sync policy
      </label>
      <div className="session-toggle-group" role="group" aria-label="Extension sync policy">
        <button
          type="button"
          className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'ALLOW' ? 'is-active' : ''}`}
          aria-pressed={props.settingsExtensionSyncPolicy === 'ALLOW'}
          onClick={() => props.onSettingsExtensionSyncPolicyChange('ALLOW')}
          disabled={props.isSaving}
        >
          ALLOW
        </button>
        <button
          type="button"
          className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'DM_ONLY' ? 'is-active' : ''}`}
          aria-pressed={props.settingsExtensionSyncPolicy === 'DM_ONLY'}
          onClick={() => props.onSettingsExtensionSyncPolicyChange('DM_ONLY')}
          disabled={props.isSaving}
        >
          DM_ONLY
        </button>
        <button
          type="button"
          className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'NONE' ? 'is-active' : ''}`}
          aria-pressed={props.settingsExtensionSyncPolicy === 'NONE'}
          onClick={() => props.onSettingsExtensionSyncPolicyChange('NONE')}
          disabled={props.isSaving}
        >
          NONE
        </button>
      </div>

      <label className="session-label" htmlFor="workspace-campaign-settings-late-join-policy">
        Late join policy
      </label>
      <div className="session-toggle-group" role="group" aria-label="Late join policy">
        <button
          type="button"
          className={`session-toggle-button ${props.settingsLateJoinPolicy === 'OPEN' ? 'is-active' : ''}`}
          aria-pressed={props.settingsLateJoinPolicy === 'OPEN'}
          onClick={() => props.onSettingsLateJoinPolicyChange('OPEN')}
          disabled={props.isSaving}
        >
          OPEN
        </button>
        <button
          type="button"
          className={`session-toggle-button ${props.settingsLateJoinPolicy === 'SCREENED' ? 'is-active' : ''}`}
          aria-pressed={props.settingsLateJoinPolicy === 'SCREENED'}
          onClick={() => props.onSettingsLateJoinPolicyChange('SCREENED')}
          disabled={props.isSaving}
        >
          SCREENED
        </button>
        <button
          type="button"
          className={`session-toggle-button ${props.settingsLateJoinPolicy === 'BLOCKED' ? 'is-active' : ''}`}
          aria-pressed={props.settingsLateJoinPolicy === 'BLOCKED'}
          onClick={() => props.onSettingsLateJoinPolicyChange('BLOCKED')}
          disabled={props.isSaving}
        >
          BLOCKED
        </button>
      </div>

      <label className="session-label" htmlFor="workspace-campaign-settings-late-join-grace">
        Late join grace (minutes): {props.settingsLateJoinGraceMinutes}
      </label>
      <Slider
        id="workspace-campaign-settings-late-join-grace"
        className="session-slider"
        min={30}
        max={90}
        step={10}
        value={props.settingsLateJoinGraceMinutes}
        onValueChange={(nextValue) => props.onSettingsLateJoinGraceMinutesChange(nextValue)}
        disabled={props.isSaving || props.settingsLateJoinPolicy === 'OPEN'}
      />

      <label className="session-label" htmlFor="workspace-campaign-settings-dm-auto-target">
        DM auto-target on first player join
      </label>
      <div className="session-toggle-group" role="group" aria-label="DM auto-target">
        <button
          type="button"
          className={`session-toggle-button ${props.settingsDmAutoTargetOnFirstPlayerJoin ? 'is-active' : ''}`}
          aria-pressed={props.settingsDmAutoTargetOnFirstPlayerJoin}
          onClick={() => props.onSettingsDmAutoTargetOnFirstPlayerJoinChange(true)}
          disabled={props.isSaving}
        >
          ON
        </button>
        <button
          type="button"
          className={`session-toggle-button ${!props.settingsDmAutoTargetOnFirstPlayerJoin ? 'is-active' : ''}`}
          aria-pressed={!props.settingsDmAutoTargetOnFirstPlayerJoin}
          onClick={() => props.onSettingsDmAutoTargetOnFirstPlayerJoinChange(false)}
          disabled={props.isSaving}
        >
          OFF
        </button>
      </div>
    </section>
  )
}
