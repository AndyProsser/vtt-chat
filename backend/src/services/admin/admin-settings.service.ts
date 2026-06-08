import { getPrismaClient } from '@/infra/db'
import { loadDiagnosticEvents, loadTelemetryEvents } from '@/infra/telemetry-store'
import type { LogRetentionSettings } from '@/infra/telemetry-store'
import { createOperationalExportArtifact } from './admin-portability.service'

const prisma = getPrismaClient()

// ─── Runtime Settings State ───────────────────────────────────────────────────

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

// ─── Settings Backup ──────────────────────────────────────────────────────────

export function applyAdminSettingsRestorePayload(params: { bundle: unknown }): {
  status: number
  body: Record<string, unknown>
} {
  const bundle = params.bundle as Record<string, unknown> | null

  if (!bundle || typeof bundle !== 'object') {
    return {
      status: 400,
      body: { error: 'Invalid bundle: expected a JSON object', code: 'INVALID_BUNDLE' },
    }
  }

  if (!bundle.settings || typeof bundle.settings !== 'object') {
    return {
      status: 400,
      body: { error: 'Bundle is missing a valid settings block', code: 'MISSING_SETTINGS' },
    }
  }

  const restored = updateRuntimeAdminSettingsFromBody(bundle.settings as Record<string, unknown>)

  return {
    status: 200,
    body: {
      message: 'Settings restored from bundle successfully',
      restoredAt: restored.updatedAt,
      settings: restored,
    },
  }
}

export function buildSettingsBackupQueuedPayload(): {
  message: string
  queuedAt: string
  auditMetadata: { triggeredAt: string }
} {
  const queuedAt = new Date().toISOString()
  return {
    message: 'Backup queued successfully',
    queuedAt,
    auditMetadata: { triggeredAt: queuedAt },
  }
}

export async function buildSettingsOperationsExportPayload(actorUserId: string): Promise<{
  message: string
  artifactId: string
  bundle: unknown
  auditMetadata: {
    artifactId: string
    telemetryCount: number
    diagnosticCount: number
    auditCount: number
  }
}> {
  const [telemetry, diagnostics, auditLog] = await Promise.all([
    loadTelemetryEvents(),
    loadDiagnosticEvents(),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        actorUserId: true,
        actorName: true,
        actorRole: true,
        action: true,
        targetType: true,
        targetId: true,
        outcome: true,
        reason: true,
        metadata: true,
        createdAt: true,
      },
    }),
  ])

  const exported = await createOperationalExportArtifact(
    actorUserId,
    getRuntimeAdminSettingsState() as unknown as Record<string, unknown>,
    telemetry.map((entry) => ({ ...entry })),
    diagnostics.map((entry) => ({ ...entry })),
    auditLog.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })) as Array<Record<string, unknown>>
  )

  return {
    message: 'Operations export created successfully',
    artifactId: exported.artifactId,
    bundle: exported.bundle,
    auditMetadata: {
      artifactId: exported.artifactId,
      telemetryCount: telemetry.length,
      diagnosticCount: diagnostics.length,
      auditCount: auditLog.length,
    },
  }
}
