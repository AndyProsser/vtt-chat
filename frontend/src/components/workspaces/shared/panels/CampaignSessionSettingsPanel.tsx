import * as TabsPrimitive from '@radix-ui/react-tabs'
import { Icon } from '@/components/ui/Icon'
import '@/styles/components/workspaces/shared/panels/WorkspaceSettingsPanel.css'

export interface CampaignSessionSettingsPanelProps {
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
  dmAutoTarget: boolean
  onDmAutoTargetChange: (value: boolean) => void
  onSaveDmAutoTarget: () => void
  isSaving: boolean
  isLoading: boolean
  standalone?: boolean
}

export function CampaignSessionSettingsPanel(props: CampaignSessionSettingsPanelProps) {
  const heading = (
    <h3 className="crbs-heading">
      <Icon name="settings" />
      Campaign Settings
    </h3>
  )

  const content = (
    <>
      <section className="crbs-section">
        <h4 className="crbs-section-heading">Session</h4>
        <p className="crbs-description">State: {props.sessionStateLabel}</p>

        <label className="crbs-field" htmlFor="crbs-session-name">
          <span className="crbs-field-label">Session name</span>
          <input
            id="crbs-session-name"
            type="text"
            className="crbs-input"
            value={props.sessionName}
            onChange={(event) => props.onSessionNameChange(event.target.value)}
            disabled={!props.canEditSessionSettings || props.isSessionSaving}
          />
        </label>

        <label className="crbs-field" htmlFor="crbs-session-description">
          <span className="crbs-field-label">Session description</span>
          <textarea
            id="crbs-session-description"
            className="crbs-textarea"
            value={props.sessionDescription}
            onChange={(event) => props.onSessionDescriptionChange(event.target.value)}
            disabled={!props.canEditSessionSettings || props.isSessionSaving}
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
            value={props.plannedDurationMinutes}
            onChange={(event) => props.onPlannedDurationMinutesChange(Number(event.target.value))}
            disabled={!props.canEditSessionSettings || props.isSessionSaving}
          />
        </label>

        <div className="crbs-actions">
          <button
            type="button"
            className="session-button"
            disabled={!props.campaignId || !props.canEditSessionSettings || props.isSessionSaving}
            onClick={props.onSaveSessionSettings}
          >
            {props.isSessionSaving ? 'Saving...' : 'Save session settings'}
          </button>
        </div>
        {!props.canEditSessionSettings ? (
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

        <TabsPrimitive.Root
          value={props.dmAutoTarget ? 'on' : 'off'}
          onValueChange={(next) => props.onDmAutoTargetChange(next === 'on')}
          className="crbs-toggle-tabs"
        >
          <TabsPrimitive.List className="crbs-toggle-tabs-list" aria-label="DM auto-target">
            <TabsPrimitive.Trigger
              value="on"
              className="crbs-toggle-tab-trigger"
              disabled={props.isLoading || props.isSaving}
            >
              ON
            </TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger
              value="off"
              className="crbs-toggle-tab-trigger"
              disabled={props.isLoading || props.isSaving}
            >
              OFF
            </TabsPrimitive.Trigger>
          </TabsPrimitive.List>
        </TabsPrimitive.Root>

        <div className="crbs-actions">
          <button
            type="button"
            className="session-button"
            disabled={!props.campaignId || props.isLoading || props.isSaving}
            onClick={props.onSaveDmAutoTarget}
          >
            {props.isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </section>
    </>
  )

  if (props.standalone) {
    return (
      <div className="crbs-panel" aria-label="Campaign settings">
        {heading}
        <div className="crbs-tab-content">{content}</div>
      </div>
    )
  }

  return content
}
