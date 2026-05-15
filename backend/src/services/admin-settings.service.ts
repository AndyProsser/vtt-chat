import type { LogRetentionSettings } from '@/infra/telemetry-store'

export interface RuntimeAdminSettingsState {
  primaryRegion: string
  maintenanceMode: 'off' | 'read-only' | 'full'
  chatPipelineEnabled: boolean
  audioOverridesEnabled: boolean
  logRetentionDays: number
  backupWindow: string
  updatedAt: string
}

const runtimeSettingsDefaults: Omit<RuntimeAdminSettingsState, 'updatedAt'> = {
  primaryRegion: 'us-east-1',
  maintenanceMode: 'off',
  chatPipelineEnabled: true,
  audioOverridesEnabled: true,
  logRetentionDays: 30,
  backupWindow: '02:00 UTC',
}

let runtimeSettingsState: RuntimeAdminSettingsState = {
  ...runtimeSettingsDefaults,
  updatedAt: new Date().toISOString(),
}

export function getRuntimeAdminSettingsState(): RuntimeAdminSettingsState {
  return runtimeSettingsState
}

export function updateRuntimeAdminSettingsFromBody(
  body: Record<string, unknown>
): RuntimeAdminSettingsState {
  runtimeSettingsState = {
    ...runtimeSettingsState,
    primaryRegion:
      typeof body.primaryRegion === 'string' && body.primaryRegion.trim()
        ? body.primaryRegion.trim()
        : runtimeSettingsState.primaryRegion,
    maintenanceMode:
      body.maintenanceMode === 'off' ||
      body.maintenanceMode === 'read-only' ||
      body.maintenanceMode === 'full'
        ? body.maintenanceMode
        : runtimeSettingsState.maintenanceMode,
    chatPipelineEnabled:
      typeof body.chatPipelineEnabled === 'boolean'
        ? body.chatPipelineEnabled
        : runtimeSettingsState.chatPipelineEnabled,
    audioOverridesEnabled:
      typeof body.audioOverridesEnabled === 'boolean'
        ? body.audioOverridesEnabled
        : runtimeSettingsState.audioOverridesEnabled,
    logRetentionDays:
      typeof body.logRetentionDays === 'number' && body.logRetentionDays >= 1
        ? Math.round(body.logRetentionDays)
        : runtimeSettingsState.logRetentionDays,
    backupWindow:
      typeof body.backupWindow === 'string' && body.backupWindow.trim()
        ? body.backupWindow.trim()
        : runtimeSettingsState.backupWindow,
    updatedAt: new Date().toISOString(),
  }

  return runtimeSettingsState
}

export function buildLogRetentionPatch(
  body: Record<string, unknown>
): Partial<LogRetentionSettings> {
  return {
    telemetryRetentionDays: body.telemetryRetentionDays as number | undefined,
    telemetryMaxFileSizeMb: body.telemetryMaxFileSizeMb as number | undefined,
    telemetryMaxFiles: body.telemetryMaxFiles as number | undefined,
    diagnosticRetentionDays: body.diagnosticRetentionDays as number | undefined,
    diagnosticMaxFileSizeMb: body.diagnosticMaxFileSizeMb as number | undefined,
    diagnosticMaxFiles: body.diagnosticMaxFiles as number | undefined,
  }
}

export function mergeAdminSettingsWithRetention(
  runtime: RuntimeAdminSettingsState,
  retention: LogRetentionSettings
): RuntimeAdminSettingsState & LogRetentionSettings {
  return {
    ...runtime,
    telemetryRetentionDays: retention.telemetryRetentionDays,
    telemetryMaxFileSizeMb: retention.telemetryMaxFileSizeMb,
    telemetryMaxFiles: retention.telemetryMaxFiles,
    diagnosticRetentionDays: retention.diagnosticRetentionDays,
    diagnosticMaxFileSizeMb: retention.diagnosticMaxFileSizeMb,
    diagnosticMaxFiles: retention.diagnosticMaxFiles,
  }
}
