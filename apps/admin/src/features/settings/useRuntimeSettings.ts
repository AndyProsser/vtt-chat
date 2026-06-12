import { useEffect, useState } from 'react'
import { requestJson } from '../../utils/api'
import type { RuntimeSettings } from '@/types/settings'

export function useRuntimeSettings() {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [backupBusy, setBackupBusy] = useState(false)
  const [opsExportBusy, setOpsExportBusy] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreBundleText, setRestoreBundleText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [operationsExportText, setOperationsExportText] = useState('')

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

  const exportOperationsBundle = async () => {
    setOpsExportBusy(true)
    setError(null)
    setStatusMessage(null)

    try {
      const response = await requestJson<{ message: string; artifactId: string; bundle: unknown }>(
        '/settings/backup/export',
        {
          method: 'GET',
        }
      )

      setOperationsExportText(JSON.stringify(response.bundle, null, 2))
      setStatusMessage(`${response.message} (${response.artifactId})`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export operations bundle')
    } finally {
      setOpsExportBusy(false)
    }
  }

  const restoreFromBundle = async () => {
    const trimmed = restoreBundleText.trim()
    if (!trimmed) {
      setError('Paste an exported bundle JSON before restoring.')
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      setError('Invalid JSON — ensure the bundle is unmodified from the export.')
      return
    }

    setRestoreBusy(true)
    setError(null)
    setStatusMessage(null)

    try {
      const response = await requestJson<{
        message: string
        restoredAt: string
        settings: RuntimeSettings
      }>('/settings/backup/restore', {
        method: 'POST',
        body: JSON.stringify({ bundle: parsed }),
      })

      setSettings(response.settings)
      setStatusMessage(`${response.message} (${new Date(response.restoredAt).toLocaleString()})`)
      setRestoreBundleText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore settings from bundle')
    } finally {
      setRestoreBusy(false)
    }
  }

  return {
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
  }
}
