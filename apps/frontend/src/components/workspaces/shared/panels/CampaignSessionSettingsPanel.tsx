import { memo, useState, type CSSProperties } from 'react'
import { Slider } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import {
  getBooleanToggleLabel,
  getLateJoinPolicyLabel,
  LATE_JOIN_POLICY_OPTIONS,
} from '@/constants/sessionUi.constants'
import type { LateJoinPolicy } from '@/types/sessionUi'
import { SessionTimerCard } from './CampaignSessionSettingsPanel.Timer'
import '@/styles/components/workspaces/shared/panels/WorkspaceSettingsPanel.css'

/**
 * Campaign-level policy fields surfaced inside the in-session settings panel.
 * Mirrors a subset of the editor's policy bindings so the DM can adjust the
 * same controls without leaving the session.
 */
export interface CampaignSessionPolicyBindings {
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  onSettingsDmAutoTargetOnFirstPlayerJoinChange: (value: boolean) => void

  settingsLateJoinPolicy: LateJoinPolicy
  onSettingsLateJoinPolicyChange: (value: LateJoinPolicy) => void
  settingsLateJoinGraceMinutes: number
  onSettingsLateJoinGraceMinutesChange: (value: number) => void

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
}

export interface CampaignSessionSettingsPanelProps {
  campaignId: string | null
  sessionName: string
  plannedDurationMinutes: number
  defaultSessionDurationMinutes: number
  sessionStateLabel: string
  sessionStartedAt: number | undefined
  canEditSessionSettings: boolean
  canEditEndedSessionName?: boolean
  onSessionNameChange: (value: string) => void
  onPlannedDurationMinutesChange: (value: number) => void
  /** Save handler — when campaignPolicy is provided, this should also persist campaign settings. */
  onSaveSessionSettings: () => void
  isSessionSaving: boolean
  isSaving: boolean
  isLoading: boolean
  standalone?: boolean
  campaignPolicy?: CampaignSessionPolicyBindings
}

/** Formats minutes as "Xh Ym" (e.g. 240 → "4h 0m", 90 → "1h 30m"). */
function formatSessionDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Reusable ON/OFF toggle pair matching the editor pattern. */
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
        {getBooleanToggleLabel(true)}
      </button>
      <button
        type="button"
        className={`session-toggle-button ${!value ? 'is-active' : ''}`}
        aria-pressed={!value}
        onClick={() => onChange(false)}
        disabled={disabled}
      >
        {getBooleanToggleLabel(false)}
      </button>
    </div>
  )
}

export const CampaignSessionSettingsPanel = memo(function CampaignSessionSettingsPanel(
  props: CampaignSessionSettingsPanelProps
) {
  const [isSaving, setIsSaving] = useState(false)
  const [isSpectatorsExpanded, setIsSpectatorsExpanded] = useState(false)
  const durationMin = 60
  const durationMax = 720

  const defaultDurationMarkerPercent =
    ((Math.min(durationMax, Math.max(durationMin, props.defaultSessionDurationMinutes)) -
      durationMin) /
      (durationMax - durationMin)) *
    100

  const handleSave = async () => {
    setIsSaving(true)
    await props.onSaveSessionSettings()
    setIsSaving(false)
  }

  const policy = props.campaignPolicy
  const canEditNameOnly = Boolean(props.canEditEndedSessionName)
  const disabledBase = !props.canEditSessionSettings || props.isSessionSaving
  const sessionNameDisabled =
    (!props.canEditSessionSettings && !canEditNameOnly) || props.isSessionSaving
  const disabledSessionControls = !props.canEditSessionSettings || props.isSessionSaving
  const spectatorChildDisabled =
    disabledSessionControls || (policy ? !policy.settingsSpectatorsEnabled : true)

  const heading = (
    <div className="session-campaign-settings-header">
      <div>
        <h4 className="session-inline-form-title session-inline-form-title--with-icon">
          <Icon name="settings" />
          <span>Session Settings</span>
        </h4>
      </div>
      <button
        type="button"
        className="session-icon-action session-icon-action--icon"
        aria-label={isSaving ? 'Saving settings' : 'Save session settings'}
        disabled={
          isSaving || !props.campaignId || (!props.canEditSessionSettings && !canEditNameOnly)
        }
        onClick={handleSave}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {isSaving ? 'hourglass_top' : 'save'}
        </span>
      </button>
    </div>
  )

  const content = (
    <div className="session-campaign-settings-panel session-campaign-settings-workspace-root csp-single-col">
      <SessionTimerCard
        sessionStartedAt={props.sessionStartedAt}
        sessionStateLabel={props.sessionStateLabel}
        plannedDurationMinutes={props.plannedDurationMinutes}
      />

      <div className="csp-card">
        <h5 className="crbs-heading csp-card-heading">Session</h5>

        <label className="session-label" htmlFor="css-session-name">
          Session Name <span className="csp-session-name-badge">This session</span>
        </label>
        <input
          id="css-session-name"
          type="text"
          className="session-input"
          value={props.sessionName}
          onChange={(event) => props.onSessionNameChange(event.target.value)}
          disabled={sessionNameDisabled}
          placeholder="Session name"
          maxLength={255}
        />

        <label className="session-label" id="label-session-duration">
          Session duration: {formatSessionDuration(props.plannedDurationMinutes)}
        </label>
        <Slider
          id="campaign-session-settings-duration"
          className="session-slider csp-session-duration-slider"
          aria-labelledby="label-session-duration"
          style={
            {
              '--csp-default-marker-position': `${defaultDurationMarkerPercent}%`,
            } as CSSProperties
          }
          min={durationMin}
          max={durationMax}
          step={15}
          value={props.plannedDurationMinutes}
          onValueChange={(nextValue) => props.onPlannedDurationMinutesChange(nextValue)}
          disabled={disabledSessionControls}
        />

        {policy && (
          <>
            <label className="session-label" id="label-dm-auto-target">
              Auto-target voice on player move
            </label>
            <TogglePair
              id="dm-auto-target"
              value={policy.settingsDmAutoTargetOnFirstPlayerJoin}
              onChange={policy.onSettingsDmAutoTargetOnFirstPlayerJoinChange}
              disabled={disabledSessionControls}
            />

            <label className="session-label" id="label-late-join-policy">
              Late join policy
            </label>
            <div
              className="session-toggle-group"
              role="group"
              aria-labelledby="label-late-join-policy"
            >
              {LATE_JOIN_POLICY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`session-toggle-button ${policy.settingsLateJoinPolicy === p ? 'is-active' : ''}`}
                  aria-pressed={policy.settingsLateJoinPolicy === p}
                  onClick={() => policy.onSettingsLateJoinPolicyChange(p)}
                  disabled={disabledSessionControls}
                >
                  {getLateJoinPolicyLabel(p)}
                </button>
              ))}
            </div>

            <label className="session-label" id="label-late-join-grace">
              Late join grace: {policy.settingsLateJoinGraceMinutes} min
            </label>
            <Slider
              id="campaign-session-settings-late-join-grace"
              className="session-slider"
              aria-labelledby="label-late-join-grace"
              min={30}
              max={90}
              step={10}
              value={policy.settingsLateJoinGraceMinutes}
              onValueChange={(v) => policy.onSettingsLateJoinGraceMinutesChange(v)}
              disabled={disabledSessionControls || policy.settingsLateJoinPolicy === 'OPEN'}
            />
          </>
        )}
      </div>

      {policy && (
        <div className="csp-card csp-card--collapsible">
          <button
            type="button"
            className="csp-card-collapsible-header"
            aria-expanded={isSpectatorsExpanded}
            onClick={() => setIsSpectatorsExpanded((v) => !v)}
          >
            <h5 className="crbs-heading csp-card-heading csp-card-heading--inline">Spectators</h5>
            <span className="csp-card-collapsible-header-right">
              <span
                className={`csp-status-pill ${policy.settingsSpectatorsEnabled ? 'csp-status-pill--on' : 'csp-status-pill--off'}`}
              >
                {getBooleanToggleLabel(policy.settingsSpectatorsEnabled)}
              </span>
              <span
                className="material-symbols-outlined csp-card-collapsible-chevron"
                aria-hidden="true"
              >
                {isSpectatorsExpanded ? 'expand_more' : 'chevron_right'}
              </span>
            </span>
          </button>

          {isSpectatorsExpanded && (
            <div className="csp-card-collapsible-body">
              <label className="session-label" id="label-spectators">
                Spectators
              </label>
              <TogglePair
                id="spectators"
                value={policy.settingsSpectatorsEnabled}
                onChange={policy.onSettingsSpectatorsEnabledChange}
                disabled={disabledSessionControls}
              />

              <label className="session-label" id="label-spectator-max">
                Max spectators: {policy.settingsSpectatorMax}
              </label>
              <Slider
                id="campaign-session-settings-spectator-max"
                className="session-slider"
                aria-labelledby="label-spectator-max"
                min={5}
                max={50}
                step={5}
                value={policy.settingsSpectatorMax}
                onValueChange={(v) => policy.onSettingsSpectatorMaxChange(v)}
                disabled={spectatorChildDisabled}
              />

              <label className="session-label" id="label-waitlist">
                Spectator waitlist
              </label>
              <TogglePair
                id="waitlist"
                value={policy.settingsSpectatorWaitlistEnabled}
                onChange={policy.onSettingsSpectatorWaitlistEnabledChange}
                disabled={spectatorChildDisabled}
              />

              <label className="session-label" id="label-reconnect-grace">
                Reconnect grace: {policy.settingsSpectatorReconnectGraceSecs}s
              </label>
              <Slider
                id="campaign-session-settings-reconnect-grace"
                className="session-slider"
                aria-labelledby="label-reconnect-grace"
                min={30}
                max={90}
                step={5}
                value={policy.settingsSpectatorReconnectGraceSecs}
                onValueChange={(v) => policy.onSettingsSpectatorReconnectGraceSecsChange(v)}
                disabled={spectatorChildDisabled}
              />

              <label className="session-label" id="label-post-session-chat">
                Can spectators chat during cooldown?
              </label>
              <TogglePair
                id="post-session-chat"
                value={policy.settingsPostSessionChatEnabled}
                onChange={policy.onSettingsPostSessionChatEnabledChange}
                disabled={spectatorChildDisabled}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )

  if (props.standalone) {
    return (
      <div className="crbs-panel" aria-label="Session settings">
        {heading}
        <div className="crbs-tab-content">{content}</div>
      </div>
    )
  }

  return (
    <>
      {heading}
      {content}
    </>
  )
})
