import type { Prisma } from '@prisma/client'
import { getPrismaClient } from '@/infra/db'
import type { AdminAuthToken } from '@/types'

const prisma = getPrismaClient()

export interface AdminAuditWriteInput {
  actor?: AdminAuthToken
  action: string
  targetType: string
  targetId?: string
  reason?: string
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILED'
  metadata?: unknown
}

export async function writeAdminAudit(params: AdminAuditWriteInput): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      actorUserId: params.actor?.userId,
      actorName: params.actor?.username || 'system',
      actorRole: params.actor?.adminRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      outcome: params.outcome || 'SUCCESS',
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  })
}
