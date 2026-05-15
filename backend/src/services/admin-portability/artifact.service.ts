import { PORTABILITY_FORMAT_VERSION } from '@/constants/admin-portability.constants'
import type { PortabilityArtifactType, PresenceState, Prisma, PrismaClient } from '@prisma/client'
import type { OperationalExportBundle } from '@/types/portability.types'
import { isCampaignTransferBundle } from './shared'

export async function createOperationalExportArtifact(
  prisma: PrismaClient,
  actorUserId: string,
  settings: Record<string, unknown>,
  telemetry: Array<Record<string, unknown>>,
  diagnostics: Array<Record<string, unknown>>,
  auditLog: Array<Record<string, unknown>>
) {
  const bundle: OperationalExportBundle = {
    version: PORTABILITY_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    telemetry,
    diagnostics,
    auditLog,
  }

  const artifact = await prisma.importExportArtifact.create({
    data: {
      type: 'OPERATIONS_EXPORT',
      createdByUserId: actorUserId,
      formatVersion: PORTABILITY_FORMAT_VERSION,
      payload: bundle as unknown as Prisma.InputJsonValue,
      metadata: {
        telemetryCount: telemetry.length,
        diagnosticCount: diagnostics.length,
        auditCount: auditLog.length,
      } as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  return {
    artifactId: artifact.id,
    bundle,
  }
}

export function isValidTransferBundle(
  input: unknown
): input is import('@/types/portability.types').CampaignTransferBundle {
  return isCampaignTransferBundle(input)
}

export function portabilityArtifactTypeLabel(type: PortabilityArtifactType): string {
  if (type === 'CAMPAIGN_EXPORT') return 'Campaign export'
  if (type === 'CAMPAIGN_IMPORT') return 'Campaign import'
  return 'Operations export'
}

export function defaultRecordingState(): PresenceState {
  return 'OFFLINE'
}
