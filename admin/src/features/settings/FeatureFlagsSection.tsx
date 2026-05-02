import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import type { RuntimeSettings } from '@/types/settings'

interface FeatureFlagsSectionProps {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

export function FeatureFlagsSection({ settings, onChange }: FeatureFlagsSectionProps) {
  return (
    <SettingsSection title="Feature Flags">
      <SettingsField label="Chat Pipeline" htmlFor="chatFlag">
        <select
          id="chatFlag"
          value={settings.chatPipelineEnabled ? 'enabled' : 'disabled'}
          onChange={(event) => onChange({ chatPipelineEnabled: event.target.value === 'enabled' })}
        >
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </SettingsField>

      <SettingsField label="Audio Overrides" htmlFor="audioFlag">
        <select
          id="audioFlag"
          value={settings.audioOverridesEnabled ? 'enabled' : 'disabled'}
          onChange={(event) =>
            onChange({ audioOverridesEnabled: event.target.value === 'enabled' })
          }
        >
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </SettingsField>
    </SettingsSection>
  )
}
