import { Alert, Box, Button, Typography } from '@mui/material'
import { FeatureFlagsSection } from '../features/settings/FeatureFlagsSection'
import { LogSinkPoliciesSection } from '../features/settings/LogSinkPoliciesSection'
import { SettingsSection } from '../features/settings/SettingsSection'
import { StorageSection } from '../features/settings/StorageSection'
import { SystemConfigSection } from '../features/settings/SystemConfigSection'
import type { RuntimeSettings } from '@/types/settings'
import { useRuntimeSettings } from '../features/settings/useRuntimeSettings'
import '../styles/Settings.css'

export default function Settings() {
  const {
    settings,
    setSettings,
    loading,
    saving,
    backupBusy,
    opsExportBusy,
    restoreBusy,
    restoreBundleText,
    setRestoreBundleText,
    error,
    statusMessage,
    operationsExportText,
    updateSettings,
    triggerBackup,
    exportOperationsBundle,
    restoreFromBundle,
  } = useRuntimeSettings()

  const handleChange = (partial: Partial<RuntimeSettings>) => {
    setSettings((current) => (current ? { ...current, ...partial } : current))
  }

  return (
    <Box component="section" className="settings-page" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h5">Settings</Typography>
      <Typography variant="body2" color="text.secondary">
        System configuration and maintenance controls.
      </Typography>

      {loading && <Alert severity="info">Loading settings...</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {statusMessage && <Alert severity="success">{statusMessage}</Alert>}

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

          <Box className="admin-actions-row" sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" disabled={saving} onClick={() => void updateSettings()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button variant="outlined" disabled={backupBusy} onClick={() => void triggerBackup()}>
              {backupBusy ? 'Queuing...' : 'Backup Now'}
            </Button>
            <Button
              variant="outlined"
              disabled={opsExportBusy}
              onClick={() => void exportOperationsBundle()}
            >
              {opsExportBusy ? 'Exporting...' : 'Export Ops Bundle'}
            </Button>
          </Box>

          {operationsExportText ? (
            <Box sx={{ display: 'grid', gap: 1 }}>
              <Typography variant="subtitle2">Operational Export Bundle</Typography>
              <textarea
                aria-label="Operations export bundle"
                className="settings-export-textarea"
                value={operationsExportText}
                readOnly
              />
            </Box>
          ) : null}

          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="subtitle2">Restore Settings from Bundle</Typography>
            <Typography variant="body2" color="text.secondary">
              Paste a previously exported Operational Export Bundle to restore admin settings. Only
              the settings block is applied — telemetry and audit log entries are not replayed.
            </Typography>
            <textarea
              aria-label="Restore bundle input"
              className="settings-export-textarea"
              placeholder='Paste exported bundle JSON here ({"version":..., "settings":...})'
              value={restoreBundleText}
              onChange={(e) => setRestoreBundleText(e.target.value)}
            />
            <Box>
              <Button
                variant="outlined"
                color="warning"
                disabled={restoreBusy || !restoreBundleText.trim()}
                onClick={() => void restoreFromBundle()}
              >
                {restoreBusy ? 'Restoring...' : 'Restore from Bundle'}
              </Button>
            </Box>
          </Box>
        </>
      )}
    </Box>
  )
}
