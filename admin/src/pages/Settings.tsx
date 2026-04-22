import { SettingsField } from '../features/settings/SettingsField'
import { SettingsSection } from '../features/settings/SettingsSection'
import { useRuntimeSettings } from '../features/settings/useRuntimeSettings'
import '../styles/Settings.css'

export default function Settings() {
  const {
    settings,
    setSettings,
    loading,
    saving,
    backupBusy,
    error,
    statusMessage,
    updateSettings,
    triggerBackup,
  } = useRuntimeSettings()

  return (
    <section className="admin-page settings-page">
      <h2 className="admin-page-title">Settings</h2>
      <p className="admin-page-subtitle">System configuration and maintenance controls.</p>

      {loading && <p className="admin-inline-status">Loading settings...</p>}
      {error && <p className="admin-inline-error">{error}</p>}
      {statusMessage && <p className="settings-status-message">{statusMessage}</p>}

      {settings && (
        <>
          <div className="admin-card-grid two-col">
            <SettingsSection title="System Configuration">
              <SettingsField label="Primary Region" htmlFor="region">
                <select
                  id="region"
                  value={settings.primaryRegion}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            primaryRegion: event.target.value,
                          }
                        : current
                    )
                  }
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
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            maintenanceMode: event.target.value as typeof settings.maintenanceMode,
                          }
                        : current
                    )
                  }
                >
                  <option value="off">Off</option>
                  <option value="read-only">Read-only</option>
                  <option value="full">Full maintenance</option>
                </select>
              </SettingsField>
            </SettingsSection>

            <SettingsSection title="Feature Flags">
              <SettingsField label="Chat Pipeline" htmlFor="chatFlag">
                <select
                  id="chatFlag"
                  value={settings.chatPipelineEnabled ? 'enabled' : 'disabled'}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            chatPipelineEnabled: event.target.value === 'enabled',
                          }
                        : current
                    )
                  }
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
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            audioOverridesEnabled: event.target.value === 'enabled',
                          }
                        : current
                    )
                  }
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </SettingsField>
            </SettingsSection>

            <SettingsSection title="Storage">
              <SettingsField label="Log Retention (days)" htmlFor="retention">
                <input
                  id="retention"
                  type="number"
                  min={1}
                  value={settings.logRetentionDays}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            logRetentionDays: Math.max(1, Number(event.target.value || 1)),
                          }
                        : current
                    )
                  }
                />
              </SettingsField>

              <SettingsField label="Backup Window" htmlFor="backupWindow">
                <input
                  id="backupWindow"
                  type="text"
                  value={settings.backupWindow}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            backupWindow: event.target.value,
                          }
                        : current
                    )
                  }
                />
              </SettingsField>
            </SettingsSection>

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
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            telemetryRetentionDays: Math.max(1, Number(event.target.value || 1)),
                          }
                        : current
                    )
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
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            telemetryMaxFileSizeMb: Math.max(1, Number(event.target.value || 1)),
                          }
                        : current
                    )
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
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            telemetryMaxFiles: Math.max(1, Number(event.target.value || 1)),
                          }
                        : current
                    )
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
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            diagnosticRetentionDays: Math.max(1, Number(event.target.value || 1)),
                          }
                        : current
                    )
                  }
                />
              </SettingsField>

              <SettingsField
                label="Diagnostic Max File Size (MB)"
                htmlFor="diagnosticMaxFileSizeMb"
              >
                <input
                  id="diagnosticMaxFileSizeMb"
                  type="number"
                  min={1}
                  value={settings.diagnosticMaxFileSizeMb}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            diagnosticMaxFileSizeMb: Math.max(1, Number(event.target.value || 1)),
                          }
                        : current
                    )
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
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            diagnosticMaxFiles: Math.max(1, Number(event.target.value || 1)),
                          }
                        : current
                    )
                  }
                />
              </SettingsField>
            </SettingsSection>

            <SettingsSection title="Runtime State">
              <p className="settings-runtime-line">
                Last updated: {new Date(settings.updatedAt).toLocaleString()}
              </p>
              <p className="settings-runtime-line">
                Changes are applied immediately and tracked in admin audit logs.
              </p>
            </SettingsSection>
          </div>

          <div className="admin-actions-row">
            <button className="admin-btn" disabled={saving} onClick={() => void updateSettings()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              className="admin-btn admin-btn-ghost"
              disabled={backupBusy}
              onClick={() => void triggerBackup()}
            >
              {backupBusy ? 'Queuing...' : 'Backup Now'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
