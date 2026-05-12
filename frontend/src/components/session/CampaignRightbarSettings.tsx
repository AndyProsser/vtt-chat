import '../../styles/components/session/CampaignRightbarSettings.css'

export interface CampaignRightbarSettingsProps {
  role: 'DM' | 'PLAYER' | 'SPECTATOR'
  campaignId: string | null
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
  dmAutoTarget,
  onDmAutoTargetChange,
  onSaveDmAutoTarget,
  isSaving,
  isLoading,
}: CampaignRightbarSettingsProps) {
  if (role !== 'DM') {
    return (
      <div className="crbs-panel" aria-label="Campaign settings">
        <h3 className="crbs-heading">Campaign Settings</h3>
        <p className="crbs-muted">Only the DM can update campaign settings.</p>
      </div>
    )
  }

  return (
    <div className="crbs-panel" aria-label="Campaign settings">
      <h3 className="crbs-heading">Campaign Settings</h3>

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
    </div>
  )
}
