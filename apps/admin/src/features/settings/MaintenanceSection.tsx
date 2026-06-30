import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import type { RuntimeSettings } from '@/types/settings'

interface Props {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

export function MaintenanceSection({ settings, onChange }: Props) {
  return (
    <SettingsSection title="Maintenance">
      <SettingsField label="Maintenance Mode" htmlFor="maintenance">
        <select
          id="maintenance"
          value={settings.maintenanceMode}
          onChange={(e) =>
            onChange({ maintenanceMode: e.target.value as RuntimeSettings['maintenanceMode'] })
          }
        >
          <option value="off">Off — platform operating normally</option>
          <option value="read-only">Read-only — no new content; existing data visible</option>
          <option value="full">Full maintenance — platform unavailable to users</option>
        </select>
      </SettingsField>

      {settings.maintenanceMode !== 'off' && (
        <SettingsField label="Message shown to users" htmlFor="maintenanceMessage">
          <textarea
            id="maintenanceMessage"
            rows={3}
            style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            value={settings.maintenanceMessage ?? ''}
            placeholder="The platform is currently undergoing maintenance. Please check back shortly."
            onChange={(e) => onChange({ maintenanceMessage: e.target.value })}
          />
        </SettingsField>
      )}
    </SettingsSection>
  )
}
