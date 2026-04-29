import { Alert, Box, Button, Typography } from '@mui/material'
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
          </Box>
        </>
      )}
    </Box>
  )
}
