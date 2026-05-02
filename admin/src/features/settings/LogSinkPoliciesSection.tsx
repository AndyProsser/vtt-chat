import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import type { RuntimeSettings } from '@/types/settings'

interface LogSinkPoliciesSectionProps {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

export function LogSinkPoliciesSection({ settings, onChange }: LogSinkPoliciesSectionProps) {
  return (
    <SettingsSection title="Log Sink Policies">
      <p className="settings-help-text">
        Controls rotation and retention for durable telemetry and diagnostic streams.
      </p>

      <SettingsField label="Telemetry Retention (days)" htmlFor="telemetryRetentionDays">
        <input
          id="telemetryRetentionDays"
          type="number"
          min={1}
          value={settings.telemetryRetentionDays}
          onChange={(event) =>
            onChange({ telemetryRetentionDays: Math.max(1, Number(event.target.value || 1)) })
          }
        />
      </SettingsField>

      <SettingsField label="Telemetry Max File Size (MB)" htmlFor="telemetryMaxFileSizeMb">
        <input
          id="telemetryMaxFileSizeMb"
          type="number"
          min={1}
          value={settings.telemetryMaxFileSizeMb}
          onChange={(event) =>
            onChange({ telemetryMaxFileSizeMb: Math.max(1, Number(event.target.value || 1)) })
          }
        />
      </SettingsField>

      <SettingsField label="Telemetry Rotated Files" htmlFor="telemetryMaxFiles">
        <input
          id="telemetryMaxFiles"
          type="number"
          min={1}
          value={settings.telemetryMaxFiles}
          onChange={(event) =>
            onChange({ telemetryMaxFiles: Math.max(1, Number(event.target.value || 1)) })
          }
        />
      </SettingsField>

      <SettingsField label="Diagnostic Retention (days)" htmlFor="diagnosticRetentionDays">
        <input
          id="diagnosticRetentionDays"
          type="number"
          min={1}
          value={settings.diagnosticRetentionDays}
          onChange={(event) =>
            onChange({ diagnosticRetentionDays: Math.max(1, Number(event.target.value || 1)) })
          }
        />
      </SettingsField>

      <SettingsField label="Diagnostic Max File Size (MB)" htmlFor="diagnosticMaxFileSizeMb">
        <input
          id="diagnosticMaxFileSizeMb"
          type="number"
          min={1}
          value={settings.diagnosticMaxFileSizeMb}
          onChange={(event) =>
            onChange({ diagnosticMaxFileSizeMb: Math.max(1, Number(event.target.value || 1)) })
          }
        />
      </SettingsField>

      <SettingsField label="Diagnostic Rotated Files" htmlFor="diagnosticMaxFiles">
        <input
          id="diagnosticMaxFiles"
          type="number"
          min={1}
          value={settings.diagnosticMaxFiles}
          onChange={(event) =>
            onChange({ diagnosticMaxFiles: Math.max(1, Number(event.target.value || 1)) })
          }
        />
      </SettingsField>
    </SettingsSection>
  )
}
