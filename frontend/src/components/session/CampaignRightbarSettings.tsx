import '../../styles/components/session/CampaignRightbarSettings.css'

export interface CampaignRightbarSettingsProps {
  role: 'DM' | 'PLAYER' | 'SPECTATOR'
  campaignId: string | null
  sessionName: string
  sessionDescription: string
  plannedDurationMinutes: number
  sessionStateLabel: string
  canEditSessionSettings: boolean
  onSessionNameChange: (value: string) => void
  onSessionDescriptionChange: (value: string) => void
  onPlannedDurationMinutesChange: (value: number) => void
  onSaveSessionSettings: () => void
  isSessionSaving: boolean
  /** DM auto-target toggle value */
  dmAutoTarget: boolean
  onDmAutoTargetChange: (value: boolean) => void
  onSaveDmAutoTarget: () => void
  isSaving: boolean
  isLoading: boolean
}

export function CampaignRightbarSettings({
  role,
  campaignId,
  sessionName,
  sessionDescription,
  plannedDurationMinutes,
  sessionStateLabel,
  canEditSessionSettings,
  onSessionNameChange,
  onSessionDescriptionChange,
  onPlannedDurationMinutesChange,
  onSaveSessionSettings,
  isSessionSaving,
  dmAutoTarget,
  onDmAutoTargetChange,
  onSaveDmAutoTarget,
  isSaving,
  isLoading,
}: CampaignRightbarSettingsProps) {
  const isDm = role === 'DM'

  return (
    <div className="crbs-panel" aria-label="Campaign settings">
      {isDm && (
        <>
          <h3 className="crbs-heading">Campaign Settings</h3>

          <section className="crbs-section">
            <h4 className="crbs-section-heading">Session</h4>
            <p className="crbs-description">State: {sessionStateLabel}</p>

            <label className="crbs-field" htmlFor="crbs-session-name">
              <span className="crbs-field-label">Session name</span>
              <input
                id="crbs-session-name"
                type="text"
                className="crbs-input"
                value={sessionName}
                onChange={(event) => onSessionNameChange(event.target.value)}
                disabled={!canEditSessionSettings || isSessionSaving}
              />
            </label>

            <label className="crbs-field" htmlFor="crbs-session-description">
              <span className="crbs-field-label">Session description</span>
              <textarea
                id="crbs-session-description"
                className="crbs-textarea"
                value={sessionDescription}
                onChange={(event) => onSessionDescriptionChange(event.target.value)}
                disabled={!canEditSessionSettings || isSessionSaving}
              />
            </label>

            <label className="crbs-field" htmlFor="crbs-session-duration">
              <span className="crbs-field-label">Planned duration (minutes)</span>
              <input
                id="crbs-session-duration"
                type="number"
                min={15}
                max={720}
                step={15}
                className="crbs-input"
                value={plannedDurationMinutes}
                onChange={(event) => onPlannedDurationMinutesChange(Number(event.target.value))}
                disabled={!canEditSessionSettings || isSessionSaving}
              />
            </label>

            <div className="crbs-actions">
              <button
                type="button"
                className="session-button"
                disabled={!campaignId || !canEditSessionSettings || isSessionSaving}
                onClick={onSaveSessionSettings}
              >
                {isSessionSaving ? 'Saving…' : 'Save session settings'}
              </button>
            </div>
            {!canEditSessionSettings ? (
              <p className="crbs-muted">
                Session settings are editable only while inactive, active, or paused.
              </p>
            ) : null}
          </section>

          <section className="crbs-section">
            <h4 className="crbs-section-heading">Voice Targeting</h4>
            <p className="crbs-description">
              Automatically switch DM voice target to a group when the first player joins it.
            </p>

            <label className="crbs-toggle" htmlFor="crbs-auto-target">
              <input
                id="crbs-auto-target"
                type="checkbox"
                checked={dmAutoTarget}
                disabled={isLoading || isSaving}
                onChange={(e) => onDmAutoTargetChange(e.target.checked)}
              />
              <span>Auto-target on first player join</span>
            </label>

            <div className="crbs-actions">
              <button
                type="button"
                className="session-button"
                disabled={!campaignId || isLoading || isSaving}
                onClick={onSaveDmAutoTarget}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
