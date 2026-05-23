import { Slider } from '@/components/ui'
import type { CampaignSettingsPanelPolicyProps } from '@/types/campaignSettingsPanel'

/** Formats minutes as "Xh Ym" (e.g. 240 → "4h 0m", 90 → "1h 30m"). */
function formatSessionDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Toggle button pair helper for ON/OFF fields. */
function TogglePair({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: boolean
  onChange: (v: boolean) => void
  disabled: boolean
}) {
  return (
    <div className="session-toggle-group" role="group" aria-labelledby={`${id}-label`}>
      <button
        type="button"
        className={`session-toggle-button ${value ? 'is-active' : ''}`}
        aria-pressed={value}
        onClick={() => onChange(true)}
        disabled={disabled}
      >
        ON
      </button>
      <button
        type="button"
        className={`session-toggle-button ${!value ? 'is-active' : ''}`}
        aria-pressed={!value}
        onClick={() => onChange(false)}
        disabled={disabled}
      >
        OFF
      </button>
    </div>
  )
}

const SUPPORTED_PLATFORM_LABELS: Record<string, string> = {
  ANY: 'Any',
  DDB: 'D&D Beyond',
  ROLL20: 'Roll20',
  FOUNDRY: 'Foundry VTT',
}

const SUPPORTED_PLATFORM_TRUNCATED_LABELS: Record<string, string> = {
  ANY: 'Any',
  DDB: 'D&D Bey...',
  ROLL20: 'Roll20',
  FOUNDRY: 'Foundry...',
}

export function CampaignSettingsPanelPolicy(props: CampaignSettingsPanelPolicyProps) {
  const sessionLocked = props.isSessionActive || props.isSaving
  const cooldownMins = props.settingsPostSessionChatDurationMinutes

  function handlePlatformToggle(platform: 'ANY' | 'DDB' | 'ROLL20' | 'FOUNDRY') {
    const current = props.settingsSupportedPlatforms
    if (platform === 'ANY') {
      props.onSettingsSupportedPlatformsChange(['ANY'])
    } else {
      const withoutAny = current.filter((p) => p !== 'ANY')
      const alreadySelected = withoutAny.includes(platform)
      const next = alreadySelected
        ? withoutAny.filter((p) => p !== platform)
        : [...withoutAny, platform]
      props.onSettingsSupportedPlatformsChange(next.length === 0 ? ['ANY'] : next)
    }
  }

  const lockBadge = (
    <span className="crbs-lock-badge" title="Locked during active session">
      <span className="material-symbols-outlined crbs-lock-icon">lock</span>
    </span>
  )

  return (
    <section className="session-campaign-settings-panel" aria-label="Campaign policy settings">
      <div className="csp-cards-grid">
        {/* ── Left column: General + Session ───────────────────────────── */}
        <div className="csp-col">
          {/* General card */}
          <div className="csp-card csp-card--general">
            <h5 className="crbs-heading csp-card-heading">
              General
              {props.isSessionActive && lockBadge}
            </h5>

            <label className="session-label" id="label-visibility">
              Visibility
            </label>
            <div className="session-toggle-group" role="group" aria-labelledby="label-visibility">
              <button
                type="button"
                className={`session-toggle-button ${props.settingsVisibility === 'PUBLIC' ? 'is-active' : ''}`}
                aria-pressed={props.settingsVisibility === 'PUBLIC'}
                onClick={() => props.onSettingsVisibilityChange('PUBLIC')}
                disabled={sessionLocked}
              >
                Public
              </button>
              <button
                type="button"
                className={`session-toggle-button ${props.settingsVisibility === 'PRIVATE' ? 'is-active' : ''}`}
                aria-pressed={props.settingsVisibility === 'PRIVATE'}
                onClick={() => props.onSettingsVisibilityChange('PRIVATE')}
                disabled={sessionLocked}
              >
                Private
              </button>
            </div>

            <label className="session-label" id="label-cooldown">
              Cooldown after session: {cooldownMins} min
            </label>
            <Slider
              id="workspace-campaign-settings-post-session-duration"
              className="session-slider"
              aria-labelledby="label-cooldown"
              min={1}
              max={15}
              step={1}
              value={cooldownMins}
              onValueChange={(nextValue) =>
                props.onSettingsPostSessionChatDurationMinutesChange(nextValue)
              }
              disabled={sessionLocked}
            />
          </div>

          {/* Session card */}
          <div className="csp-card">
            <h5 className="crbs-heading csp-card-heading">Session</h5>
            <label className="session-label" id="label-session-name-base">
              Session Name
            </label>
            <input
              id="workspace-campaign-settings-session-name-base"
              type="text"
              className="session-input"
              aria-labelledby="label-session-name-base"
              value={props.sessionNameBase}
              onChange={(event) => props.onSessionNameBaseChange(event.target.value)}
              placeholder="Session name"
              disabled={props.isSaving}
              maxLength={255}
            />
            <p className="csp-session-name-hint">
              {props.sessionNameContext === 'CURRENT'
                ? 'Applies to the current connected session until it is ended.'
                : 'Used as the base name for the next session.'}
            </p>

            <label className="session-label" id="label-session-duration">
              Default session duration:{' '}
              {formatSessionDuration(props.settingsDefaultSessionDurationMins)}
            </label>
            <Slider
              id="workspace-campaign-settings-session-duration"
              className="session-slider"
              aria-labelledby="label-session-duration"
              min={60}
              max={720}
              step={15}
              value={props.settingsDefaultSessionDurationMins}
              onValueChange={(nextValue) =>
                props.onSettingsDefaultSessionDurationMinsChange(nextValue)
              }
              disabled={props.isSaving || !props.isEditorContext}
            />

            <label className="session-label" id="label-dm-auto-target">
              Auto-target voice on player move
            </label>
            <TogglePair
              id="dm-auto-target"
              value={props.settingsDmAutoTargetOnFirstPlayerJoin}
              onChange={props.onSettingsDmAutoTargetOnFirstPlayerJoinChange}
              disabled={props.isSaving}
            />

            <label className="session-label" id="label-late-join-policy">
              Late join policy
              {props.isSessionActive && lockBadge}
            </label>
            <div
              className="session-toggle-group"
              role="group"
              aria-labelledby="label-late-join-policy"
            >
              {(['OPEN', 'SCREENED', 'BLOCKED'] as const).map((policy) => (
                <button
                  key={policy}
                  type="button"
                  className={`session-toggle-button ${props.settingsLateJoinPolicy === policy ? 'is-active' : ''}`}
                  aria-pressed={props.settingsLateJoinPolicy === policy}
                  onClick={() => props.onSettingsLateJoinPolicyChange(policy)}
                  disabled={sessionLocked}
                >
                  {policy === 'OPEN' ? 'Open' : policy === 'SCREENED' ? 'Screened' : 'Blocked'}
                </button>
              ))}
            </div>

            <label className="session-label" id="label-late-join-grace">
              Late join grace: {props.settingsLateJoinGraceMinutes} min
              {props.isSessionActive && lockBadge}
            </label>
            <Slider
              id="workspace-campaign-settings-late-join-grace"
              className="session-slider"
              aria-labelledby="label-late-join-grace"
              min={30}
              max={90}
              step={10}
              value={props.settingsLateJoinGraceMinutes}
              onValueChange={(nextValue) => props.onSettingsLateJoinGraceMinutesChange(nextValue)}
              disabled={sessionLocked || props.settingsLateJoinPolicy === 'OPEN'}
            />
          </div>
        </div>

        {/* ── Right column: Extension + Spectators ─────────────────────── */}
        <div className="csp-col">
          {/* Extension card */}
          <div className="csp-card csp-card--extension">
            <h5 className="crbs-heading csp-card-heading">
              Extension
              {props.isSessionActive && lockBadge}
            </h5>

            <label className="session-label" id="label-supported-platforms">
              Supported platforms
            </label>
            <div
              className="session-toggle-group session-toggle-group--wrap"
              role="group"
              aria-labelledby="label-supported-platforms"
            >
              {(['ANY', 'DDB', 'ROLL20', 'FOUNDRY'] as const).map((platform) => {
                const isSelected = props.settingsSupportedPlatforms.includes(platform)
                const fullLabel = SUPPORTED_PLATFORM_LABELS[platform]
                return (
                  <button
                    key={platform}
                    type="button"
                    className={`session-toggle-button ${isSelected ? 'is-active' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={fullLabel}
                    title={fullLabel}
                    onClick={() => handlePlatformToggle(platform)}
                    disabled={sessionLocked}
                  >
                    <span className="csp-platform-label">
                      {SUPPORTED_PLATFORM_TRUNCATED_LABELS[platform]}
                    </span>
                  </button>
                )
              })}
            </div>

            <label className="session-label" id="label-extension-sync-policy">
              Extension sync
            </label>
            <div
              className="session-toggle-group"
              role="group"
              aria-labelledby="label-extension-sync-policy"
            >
              <button
                type="button"
                className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'ALLOW' ? 'is-active' : ''}`}
                aria-pressed={props.settingsExtensionSyncPolicy === 'ALLOW'}
                onClick={() => props.onSettingsExtensionSyncPolicyChange('ALLOW')}
                disabled={sessionLocked}
              >
                All players
              </button>
              <button
                type="button"
                className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'DM_ONLY' ? 'is-active' : ''}`}
                aria-pressed={props.settingsExtensionSyncPolicy === 'DM_ONLY'}
                onClick={() => props.onSettingsExtensionSyncPolicyChange('DM_ONLY')}
                disabled={sessionLocked}
              >
                DM only
              </button>
              <button
                type="button"
                className={`session-toggle-button ${props.settingsExtensionSyncPolicy === 'NONE' ? 'is-active' : ''}`}
                aria-pressed={props.settingsExtensionSyncPolicy === 'NONE'}
                onClick={() => props.onSettingsExtensionSyncPolicyChange('NONE')}
                disabled={sessionLocked}
              >
                Disabled
              </button>
            </div>
          </div>

          {/* Spectators card */}
          <div className="csp-card">
            <h5 className="crbs-heading csp-card-heading">
              Spectators
              {props.isSessionActive && lockBadge}
            </h5>

            <label className="session-label" id="label-spectators">
              Spectators
            </label>
            <TogglePair
              id="spectators"
              value={props.settingsSpectatorsEnabled}
              onChange={props.onSettingsSpectatorsEnabledChange}
              disabled={sessionLocked}
            />

            <label className="session-label" id="label-spectator-max">
              Max spectators: {props.settingsSpectatorMax}
            </label>
            <Slider
              id="workspace-campaign-settings-spectator-max"
              className="session-slider"
              aria-labelledby="label-spectator-max"
              min={5}
              max={50}
              step={5}
              value={props.settingsSpectatorMax}
              onValueChange={(nextValue) => props.onSettingsSpectatorMaxChange(nextValue)}
              disabled={sessionLocked || !props.settingsSpectatorsEnabled}
            />

            <label className="session-label" id="label-waitlist">
              Spectator waitlist
            </label>
            <TogglePair
              id="waitlist"
              value={props.settingsSpectatorWaitlistEnabled}
              onChange={props.onSettingsSpectatorWaitlistEnabledChange}
              disabled={sessionLocked || !props.settingsSpectatorsEnabled}
            />

            <label className="session-label" id="label-reconnect-grace">
              Reconnect grace: {props.settingsSpectatorReconnectGraceSecs}s
            </label>
            <Slider
              id="workspace-campaign-settings-reconnect-grace"
              className="session-slider"
              aria-labelledby="label-reconnect-grace"
              min={30}
              max={90}
              step={5}
              value={props.settingsSpectatorReconnectGraceSecs}
              onValueChange={(nextValue) =>
                props.onSettingsSpectatorReconnectGraceSecsChange(nextValue)
              }
              disabled={sessionLocked || !props.settingsSpectatorsEnabled}
            />

            <label className="session-label" id="label-post-session-chat">
              Can spectators chat during cooldown?
            </label>
            <TogglePair
              id="post-session-chat"
              value={props.settingsPostSessionChatEnabled}
              onChange={props.onSettingsPostSessionChatEnabledChange}
              disabled={sessionLocked || !props.settingsSpectatorsEnabled}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
