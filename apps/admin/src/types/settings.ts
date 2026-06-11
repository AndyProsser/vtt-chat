export interface RuntimeSettings {
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
