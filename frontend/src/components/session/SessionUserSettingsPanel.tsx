import type { ChangeEvent } from 'react'

interface SessionUserSettingsPanelProps {
  messageGroupingWindowMs: number
  onMessageGroupingWindowChange: (value: number) => void
}

const GROUPING_OPTIONS: Array<{ label: string; value: number; description: string }> = [
  { label: 'Off', value: 0, description: 'Always show author + timestamp for every message.' },
  { label: '2 minutes', value: 2 * 60 * 1000, description: 'Group quick back-to-back replies.' },
  {
    label: '5 minutes',
    value: 5 * 60 * 1000,
    description: 'Default; balanced grouping for table chat.',
  },
  {
    label: '10 minutes',
    value: 10 * 60 * 1000,
    description: 'More aggressive grouping for long message runs.',
  },
]

export function SessionUserSettingsPanel({
  messageGroupingWindowMs,
  onMessageGroupingWindowChange,
}: SessionUserSettingsPanelProps) {
  const handleGroupingWindowChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onMessageGroupingWindowChange(Number(event.target.value))
  }

  const selectedOption =
    GROUPING_OPTIONS.find((option) => option.value === messageGroupingWindowMs) ||
    GROUPING_OPTIONS[2]

  return (
    <section className="session-settings-panel" aria-label="User settings">
      <h4 className="session-settings-panel__title">User Settings</h4>
      <p className="session-settings-panel__subtitle">
        Personalize your chat and command center behavior.
      </p>

      <div className="session-settings-item">
        <label htmlFor="message-grouping-window" className="session-settings-item__label">
          Message grouping window
        </label>
        <p className="session-settings-item__description">
          Consecutive messages by the same author are grouped within this time window.
        </p>
        <select
          id="message-grouping-window"
          className="session-select session-settings-item__select"
          value={String(selectedOption.value)}
          onChange={handleGroupingWindowChange}
        >
          {GROUPING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="session-settings-item__hint">{selectedOption.description}</p>
      </div>
    </section>
  )
}
