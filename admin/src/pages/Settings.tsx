import { FeatureFlagsSection } from '../features/settings/FeatureFlagsSection'
import { LogSinkPoliciesSection } from '../features/settings/LogSinkPoliciesSection'
import { SettingsSection } from '../features/settings/SettingsSection'
import { StorageSection } from '../features/settings/StorageSection'
import { SystemConfigSection } from '../features/settings/SystemConfigSection'
import type { RuntimeSettings } from '../features/settings/types'
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

  const handleChange = (partial: Partial<RuntimeSettings>) => {
    setSettings((current) => (current ? { ...current, ...partial } : current))
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
            <SystemConfigSection settings={settings} onChange={handleChange} />
            <FeatureFlagsSection settings={settings} onChange={handleChange} />
            <StorageSection settings={settings} onChange={handleChange} />
            <LogSinkPoliciesSection settings={settings} onChange={handleChange} />

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
