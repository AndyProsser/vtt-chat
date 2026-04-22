import { useEffect, useState } from 'react'
import { requestJson } from '../../utils/api'
import type { RuntimeSettings } from './types'

export function useRuntimeSettings() {
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

  return {
    settings,
    setSettings,
    loading,
    saving,
    backupBusy,
    error,
    statusMessage,
    updateSettings,
    triggerBackup,
  }
}
