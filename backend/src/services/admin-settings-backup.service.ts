import { getPrismaClient } from '@/infra/db'
import { loadDiagnosticEvents, loadTelemetryEvents } from '@/infra/telemetry-store'
import { createOperationalExportArtifact } from '@/services/admin-portability.service'
import { getRuntimeAdminSettingsState } from '@/services/admin-settings.service'

const prisma = getPrismaClient()

export function buildSettingsBackupQueuedPayload(): {
  message: string
  queuedAt: string
  auditMetadata: { triggeredAt: string }
} {
  const queuedAt = new Date().toISOString()
  return {
    message: 'Backup queued successfully',
    queuedAt,
    auditMetadata: {
      triggeredAt: queuedAt,
    },
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
    prisma,
    actorUserId,
    getRuntimeAdminSettingsState(),
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
