import { useState, useEffect } from 'react'
import { Slider } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import '@/styles/components/workspaces/shared/panels/WorkspaceSettingsPanel.css'

export interface CampaignSessionSettingsPanelProps {
  campaignId: string | null
  sessionName: string
  plannedDurationMinutes: number
  defaultSessionDurationMinutes: number
  sessionStateLabel: string
  sessionStartedAt: number | undefined
  canEditSessionSettings: boolean
  onSessionNameChange: (value: string) => void
  onPlannedDurationMinutesChange: (value: number) => void
  onSaveSessionSettings: () => void
  isSessionSaving: boolean
  isSaving: boolean
  isLoading: boolean
  standalone?: boolean
}

/** Formats minutes as "Xh Ym" (e.g. 240 → "4h 0m", 90 → "1h 30m"). */
function formatSessionDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Formats elapsed time as "Xh Ym" or "Xm Ys" */
function formatElapsedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) {
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
  return m === 0 ? `${s}s` : `${m}m ${s}s`
}

export function CampaignSessionSettingsPanel(props: CampaignSessionSettingsPanelProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now())

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTimeMs(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const sessionStartedAtMs = props.sessionStartedAt ? props.sessionStartedAt : 0
  const elapsed =
    sessionStartedAtMs > 0 ? Math.floor((currentTimeMs - sessionStartedAtMs) / 1000) : 0
  const durationSecs = props.plannedDurationMinutes * 60
  const remainingSecs = Math.max(0, durationSecs - elapsed)
  const remainingMins = Math.ceil(remainingSecs / 60)

  // Determine timer color: orange at 15 mins or less, red when duration exceeded
  const getTimerColor = (): 'default' | 'warning' | 'critical' => {
    if (elapsed >= durationSecs) return 'critical'
    if (remainingMins <= 15) return 'warning'
    return 'default'
  }

  const timerColor = getTimerColor()

  const handleSave = async () => {
    setIsSaving(true)
    await props.onSaveSessionSettings()
    setIsSaving(false)
  }

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
        className="session-icon-action"
        aria-label={isSaving ? 'Saving settings' : 'Save session settings'}
        disabled={isSaving || !props.campaignId || !props.canEditSessionSettings}
        onClick={handleSave}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          {isSaving ? 'hourglass_top' : 'save'}
        </span>
      </button>
    </div>
  )

  const content = (
    <div className="session-campaign-settings-panel session-campaign-settings-workspace-root">
      <div className="csp-cards-grid">
        <div className="csp-col">
          <div className="csp-card">
            <h5 className="crbs-heading csp-card-heading">Session</h5>

            <label className="session-label" htmlFor="css-session-name">
              Session name
            </label>
            <input
              id="css-session-name"
              type="text"
              className="session-input"
              value={props.sessionName}
              onChange={(event) => props.onSessionNameChange(event.target.value)}
              disabled={!props.canEditSessionSettings || props.isSessionSaving}
              placeholder="Session name"
              maxLength={255}
            />

            <label className="session-label" id="label-session-duration">
              Session duration: {formatSessionDuration(props.plannedDurationMinutes)}
            </label>
            <Slider
              id="campaign-session-settings-duration"
              className="session-slider"
              aria-labelledby="label-session-duration"
              min={60}
              max={720}
              step={15}
              value={props.plannedDurationMinutes}
              onValueChange={(nextValue) => props.onPlannedDurationMinutesChange(nextValue)}
              disabled={!props.canEditSessionSettings || props.isSessionSaving}
            />
          </div>
        </div>

        <div className="csp-col">
          <div className={`csp-card csp-card--timer csp-card--timer-${timerColor}`}>
            <h5 className="crbs-heading csp-card-heading">Session Timer</h5>

            <div className="csp-timer-display">
              <div className="csp-timer-value">{formatElapsedTime(elapsed)}</div>
              <div className="csp-timer-label">elapsed</div>
            </div>

            <div className="csp-timer-remaining">
              <span className="csp-timer-remaining-label">
                {elapsed >= durationSecs ? 'Over by' : 'Remaining'}
              </span>
              <span className={`csp-timer-remaining-value csp-timer-remaining-${timerColor}`}>
                {elapsed >= durationSecs
                  ? formatElapsedTime(elapsed - durationSecs)
                  : formatElapsedTime(remainingSecs)}
              </span>
            </div>

            {timerColor === 'warning' && <p className="csp-timer-warning">15 minutes remaining</p>}
            {timerColor === 'critical' && (
              <p className="csp-timer-critical">Session duration exceeded</p>
            )}
          </div>
        </div>
      </div>
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
}
