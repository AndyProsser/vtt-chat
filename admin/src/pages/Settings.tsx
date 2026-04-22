import { useEffect, useState } from 'react'
import { requestJson } from '../utils/api'
import '../styles/Settings.css'

interface RuntimeSettings {
  primaryRegion: string
  maintenanceMode: 'off' | 'read-only' | 'full'
  chatPipelineEnabled: boolean
  audioOverridesEnabled: boolean
  logRetentionDays: number
  telemetryRetentionDays: number
  telemetryMaxFileSizeMb: number
  telemetryMaxFiles: number
  diagnosticRetentionDays: number
  diagnosticMaxFileSizeMb: number
  diagnosticMaxFiles: number
  backupWindow: string
  updatedAt: string
}

export default function Settings() {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await requestJson<{ settings: RuntimeSettings }>('/settings', {
          method: 'GET',
        })
        setSettings(response.settings)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    void loadSettings()
  }, [])

  const updateSettings = async () => {
    if (!settings) {
      return
    }

    setSaving(true)
    setError(null)
    setStatusMessage(null)

    try {
      const response = await requestJson<{ message: string; settings: RuntimeSettings }>(
        '/settings',
        {
          method: 'PUT',
          body: JSON.stringify({
            primaryRegion: settings.primaryRegion,
            maintenanceMode: settings.maintenanceMode,
            chatPipelineEnabled: settings.chatPipelineEnabled,
            audioOverridesEnabled: settings.audioOverridesEnabled,
            logRetentionDays: settings.logRetentionDays,
            telemetryRetentionDays: settings.telemetryRetentionDays,
            telemetryMaxFileSizeMb: settings.telemetryMaxFileSizeMb,
            telemetryMaxFiles: settings.telemetryMaxFiles,
            diagnosticRetentionDays: settings.diagnosticRetentionDays,
            diagnosticMaxFileSizeMb: settings.diagnosticMaxFileSizeMb,
            diagnosticMaxFiles: settings.diagnosticMaxFiles,
            backupWindow: settings.backupWindow,
          }),
        }
      )

      setSettings(response.settings)
      setStatusMessage(response.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const triggerBackup = async () => {
    setBackupBusy(true)
    setError(null)
    setStatusMessage(null)

    try {
      const response = await requestJson<{ message: string; queuedAt: string }>(
        '/settings/backup',
        {
          method: 'POST',
        }
      )
      setStatusMessage(`${response.message} (${new Date(response.queuedAt).toLocaleString()})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger backup')
    } finally {
      setBackupBusy(false)
    }
  }

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
            <article className="admin-card settings-card">
              <h3>System Configuration</h3>

              <label htmlFor="region">Primary Region</label>
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

              <label htmlFor="maintenance">Maintenance Mode</label>
              <select
                id="maintenance"
                value={settings.maintenanceMode}
                onChange={(event) =>
                  setSettings((current) =>
                    current
                      ? {
                          ...current,
                          maintenanceMode: event.target.value as RuntimeSettings['maintenanceMode'],
                        }
                      : current
                  )
                }
              >
                <option value="off">Off</option>
                <option value="read-only">Read-only</option>
                <option value="full">Full maintenance</option>
              </select>
            </article>

            <article className="admin-card settings-card">
              <h3>Feature Flags</h3>

              <label htmlFor="chatFlag">Chat Pipeline</label>
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

              <label htmlFor="audioFlag">Audio Overrides</label>
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
            </article>

            <article className="admin-card settings-card">
              <h3>Storage</h3>

              <label htmlFor="retention">Log Retention (days)</label>
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

              <label htmlFor="backupWindow">Backup Window</label>
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
            </article>

            <article className="admin-card settings-card">
              <h3>Log Sink Policies</h3>
              <p className="settings-help-text">
                Controls rotation and retention for durable telemetry and diagnostic streams.
              </p>

              <label htmlFor="telemetryRetentionDays">Telemetry Retention (days)</label>
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

              <label htmlFor="telemetryMaxFileSizeMb">Telemetry Max File Size (MB)</label>
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

              <label htmlFor="telemetryMaxFiles">Telemetry Rotated Files</label>
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

              <label htmlFor="diagnosticRetentionDays">Diagnostic Retention (days)</label>
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

              <label htmlFor="diagnosticMaxFileSizeMb">Diagnostic Max File Size (MB)</label>
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

              <label htmlFor="diagnosticMaxFiles">Diagnostic Rotated Files</label>
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
            </article>

            <article className="admin-card settings-card">
              <h3>Runtime State</h3>
              <p className="settings-runtime-line">
                Last updated: {new Date(settings.updatedAt).toLocaleString()}
              </p>
              <p className="settings-runtime-line">
                Changes are applied immediately and tracked in admin audit logs.
              </p>
            </article>
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
