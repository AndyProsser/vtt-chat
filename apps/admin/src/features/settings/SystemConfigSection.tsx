import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import type { RuntimeSettings } from '@/types/settings'

interface SystemConfigSectionProps {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

export function SystemConfigSection({ settings, onChange }: SystemConfigSectionProps) {
  return (
    <SettingsSection title="System Configuration">
      <SettingsField label="Primary Region" htmlFor="region">
        <select
          id="region"
          value={settings.primaryRegion}
          onChange={(event) => onChange({ primaryRegion: event.target.value })}
        >
          <option value="us-east-1">us-east-1</option>
          <option value="eu-west-1">eu-west-1</option>
          <option value="ap-southeast-1">ap-southeast-1</option>
        </select>
      </SettingsField>

      <SettingsField label="Maintenance Mode" htmlFor="maintenance">
        <select
          id="maintenance"
          value={settings.maintenanceMode}
          onChange={(event) =>
            onChange({ maintenanceMode: event.target.value as RuntimeSettings['maintenanceMode'] })
          }
        >
          <option value="off">Off</option>
          <option value="read-only">Read-only</option>
          <option value="full">Full maintenance</option>
        </select>
      </SettingsField>
    </SettingsSection>
  )
}
