import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import type { RuntimeSettings } from '@/types/settings'

interface Props {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

function Toggle({
  id,
  label,
  value,
  onChange,
  note,
}: {
  id: string
  label: string
  value: boolean
  onChange: (v: boolean) => void
  note?: string
}) {
  return (
    <SettingsField label={label} htmlFor={id}>
      <select
        id={id}
        value={value ? 'enabled' : 'disabled'}
        onChange={(e) => onChange(e.target.value === 'enabled')}
      >
        <option value="enabled">Enabled</option>
        <option value="disabled">Disabled</option>
      </select>
      {note && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{note}</p>
      )}
    </SettingsField>
  )
}

export function FullFeatureFlagsSection({ settings, onChange }: Props) {
  return (
    <SettingsSection title="Feature Flags">
      <Toggle
        id="chatFlag"
        label="Chat Pipeline"
        value={settings.chatPipelineEnabled}
        onChange={(v) => onChange({ chatPipelineEnabled: v })}
      />
      <Toggle
        id="audioFlag"
        label="Audio Overrides"
        value={settings.audioOverridesEnabled}
        onChange={(v) => onChange({ audioOverridesEnabled: v })}
      />
      <Toggle
        id="aiWritingFlag"
        label="AI Writing Assistant"
        value={settings.aiWritingAssistantEnabled ?? false}
        onChange={(v) => onChange({ aiWritingAssistantEnabled: v })}
        note="Requires AI provider configured in the AI Integration section."
      />
      <Toggle
        id="recordingFlag"
        label="Recording & Transcription"
        value={settings.recordingEnabled ?? false}
        onChange={(v) => onChange({ recordingEnabled: v })}
        note="Requires AI provider configured. Disabled by default."
      />
      <Toggle
        id="dmQuickGenFlag"
        label="DM Quick Generate"
        value={settings.dmQuickGenerateEnabled ?? true}
        onChange={(v) => onChange({ dmQuickGenerateEnabled: v })}
        note="Falls back to static D&D 5e tables when AI provider is disabled."
      />
      <Toggle
        id="guestFlag"
        label="Guest Accounts"
        value={settings.guestAccountsEnabled ?? true}
        onChange={(v) => onChange({ guestAccountsEnabled: v })}
      />
    </SettingsSection>
  )
}
