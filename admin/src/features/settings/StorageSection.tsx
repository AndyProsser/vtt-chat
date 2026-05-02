import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import type { RuntimeSettings } from '@/types/settings'

interface StorageSectionProps {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

export function StorageSection({ settings, onChange }: StorageSectionProps) {
  return (
    <SettingsSection title="Storage">
      <SettingsField label="Log Retention (days)" htmlFor="retention">
        <input
          id="retention"
          type="number"
          min={1}
          value={settings.logRetentionDays}
          onChange={(event) =>
            onChange({ logRetentionDays: Math.max(1, Number(event.target.value || 1)) })
          }
        />
      </SettingsField>

      <SettingsField label="Backup Window" htmlFor="backupWindow">
        <input
          id="backupWindow"
          type="text"
          value={settings.backupWindow}
          onChange={(event) => onChange({ backupWindow: event.target.value })}
        />
      </SettingsField>
    </SettingsSection>
  )
}
