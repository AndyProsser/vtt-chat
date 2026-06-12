import { getPrismaClient } from '@/infra/db'
import type { ExternalSyncResult } from '@/types/integration-sync.types'

const prisma = getPrismaClient()

export type { ExternalSyncResult } from '@/types/integration-sync.types'

export async function syncExternalIntegration(params: {
  campaignId: string
  externalSystem: string
  source: 'player' | 'dm'
  user: {
    userId: string
    username: string
    role?: string
    adminRole?: string
  }
  characterUpdate?: Record<string, unknown>
  campaignUpdate?: Record<string, unknown>
}): Promise<ExternalSyncResult> {
  const membership = await prisma.campaignMembership.findUnique({
    where: {
      campaignId_userId: {
        campaignId: params.campaignId,
        userId: params.user.userId,
      },
    },
    include: {
      campaign: {
        select: {
          extensionSyncPolicy: true,
          currentDmId: true,
        },
      },
    },
  })

  if (!membership) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: 'Not a member of this campaign',
    }
  }

  const campaign = membership.campaign
  const isDm = campaign.currentDmId === params.user.userId
  const syncPolicy = campaign.extensionSyncPolicy

  let allowUpdate = false
  if (syncPolicy === 'NONE') {
    allowUpdate = false
  } else if (syncPolicy === 'DM_ONLY') {
    allowUpdate = isDm
  } else if (syncPolicy === 'DM_AND_PLAYERS') {
    allowUpdate = true
  }

  if (!allowUpdate) {
    return {
      ok: false,
      code: 'SYNC_POLICY_VIOLATION',
      message: `Sync policy "${syncPolicy}" does not permit updates from ${params.source}${isDm ? '' : 's'}`,
    }
  }

  if (params.characterUpdate && typeof params.characterUpdate === 'object') {
    const externalCharacterId = params.characterUpdate.externalCharacterId
    const level = params.characterUpdate.level

    if (!externalCharacterId || typeof externalCharacterId !== 'string') {
      return {
        ok: false,
        code: 'INVALID_CHARACTER_UPDATE',
        message: 'characterUpdate.externalCharacterId is required',
        field: 'characterUpdate.externalCharacterId',
      }
    }

    const character = await prisma.character.findFirst({
      where: {
        campaignId: params.campaignId,
        externalId: externalCharacterId,
        externalSystem: params.externalSystem,
      },
    })

    if (character) {
      const updateData: Record<string, unknown> = {}

      if (typeof level === 'number') {
        const metadata = (character.metadata as Record<string, unknown> | null) || {}
        updateData.metadata = { ...metadata, level }
      }

      if (typeof params.characterUpdate.class === 'string') {
        updateData.class = params.characterUpdate.class
      }

      if (typeof params.characterUpdate.subclass === 'string') {
        updateData.subclass = params.characterUpdate.subclass
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.character.update({
          where: { id: character.id },
          data: updateData,
        })
      }
    }
  }

  await prisma.adminAuditLog.create({
    data: {
      actorUserId: params.user.userId,
      actorName: params.user.username,
      actorRole: params.user.role || params.user.adminRole,
      action: 'external_sync',
      targetType: 'Campaign',
      targetId: params.campaignId,
      outcome: 'SUCCESS',
      metadata: {
        externalSystem: params.externalSystem,
        source: params.source,
        characterUpdateApplied: Boolean(params.characterUpdate),
        campaignUpdateApplied: Boolean(params.campaignUpdate),
      },
    },
  })

  return {
    ok: true,
    applied: {
      characterUpdate: Boolean(params.characterUpdate),
      campaignUpdate: Boolean(params.campaignUpdate),
    },
  }
}
