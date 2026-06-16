import { getPrismaClient } from '@/infra/db'
import { InventoryItemCategory } from '@shared'
import type { UUID } from '@shared'
import { syncExternalInventoryItems, setExternalCurrencyWallet } from '@/services/inventory/inventory.service'
import type { ExternalSyncResult } from '@/types/integration-sync.types'

const prisma = getPrismaClient()

export type { ExternalSyncResult } from '@/types/integration-sync.types'

export interface ExternalInventoryItemInput {
  externalId: string
  name: string
  quantity: number
  srdKey?: string
  srdCategory?: string
  notes?: string
}

export interface ExternalInventoryUpdate {
  externalCharacterId: string
  items: ExternalInventoryItemInput[]
}

export interface ExternalCurrencyUpdate {
  externalCharacterId: string
  wallet: {
    cp?: number
    sp?: number
    ep?: number
    gp?: number
    pp?: number
  }
}

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
  inventoryUpdate?: ExternalInventoryUpdate
  currencyUpdate?: ExternalCurrencyUpdate
  sessionId?: string
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

  // ─── Inventory sync ────────────────────────────────────────────────────────

  let inventoryItemsUpserted = 0

  if (params.inventoryUpdate && typeof params.inventoryUpdate === 'object') {
    const { externalCharacterId, items } = params.inventoryUpdate

    if (!externalCharacterId || typeof externalCharacterId !== 'string') {
      return {
        ok: false,
        code: 'INVALID_CHARACTER_UPDATE',
        message: 'inventoryUpdate.externalCharacterId is required',
        field: 'inventoryUpdate.externalCharacterId',
      }
    }

    if (!Array.isArray(items) || items.length === 0) {
      return {
        ok: false,
        code: 'INVALID_CHARACTER_UPDATE',
        message: 'inventoryUpdate.items must be a non-empty array',
        field: 'inventoryUpdate.items',
      }
    }

    const character = await prisma.character.findFirst({
      where: { campaignId: params.campaignId, externalId: externalCharacterId, externalSystem: params.externalSystem },
      select: { id: true },
    })

    if (character) {
      const VALID_CATEGORIES = ['EQUIPMENT', 'MAGIC_ITEM', 'HOMEBREW']
      const validatedItems = items
        .filter((it) => it && typeof it.externalId === 'string' && typeof it.name === 'string')
        .map((it) => ({
          externalId: String(it.externalId).trim(),
          name: String(it.name).trim(),
          quantity: Math.max(1, Number(it.quantity) || 1),
          srdKey: typeof it.srdKey === 'string' ? it.srdKey.trim() : undefined,
          srdCategory: VALID_CATEGORIES.includes(it.srdCategory)
            ? (it.srdCategory as InventoryItemCategory)
            : InventoryItemCategory.EQUIPMENT,
          notes: typeof it.notes === 'string' ? it.notes.trim() : undefined,
        }))

      if (validatedItems.length > 0) {
        const result = await syncExternalInventoryItems({
          campaignId: params.campaignId as UUID,
          ownerId: character.id as UUID,
          externalSource: params.externalSystem,
          items: validatedItems,
          actorUserId: params.user.userId as UUID,
          sessionId: params.sessionId as UUID | undefined,
        })
        inventoryItemsUpserted = result.upserted.length
      }
    }
  }

  // ─── Currency sync ─────────────────────────────────────────────────────────

  let currencyUpdated = false

  if (params.currencyUpdate && typeof params.currencyUpdate === 'object') {
    const { externalCharacterId, wallet } = params.currencyUpdate

    if (!externalCharacterId || typeof externalCharacterId !== 'string') {
      return {
        ok: false,
        code: 'INVALID_CHARACTER_UPDATE',
        message: 'currencyUpdate.externalCharacterId is required',
        field: 'currencyUpdate.externalCharacterId',
      }
    }

    const character = await prisma.character.findFirst({
      where: { campaignId: params.campaignId, externalId: externalCharacterId, externalSystem: params.externalSystem },
      select: { id: true },
    })

    if (character && wallet && typeof wallet === 'object') {
      const safeWallet = {
        cp: typeof wallet.cp === 'number' ? Math.max(0, wallet.cp) : undefined,
        sp: typeof wallet.sp === 'number' ? Math.max(0, wallet.sp) : undefined,
        ep: typeof wallet.ep === 'number' ? Math.max(0, wallet.ep) : undefined,
        gp: typeof wallet.gp === 'number' ? Math.max(0, wallet.gp) : undefined,
        pp: typeof wallet.pp === 'number' ? Math.max(0, wallet.pp) : undefined,
      }
      await setExternalCurrencyWallet({
        campaignId: params.campaignId as UUID,
        ownerId: character.id as UUID,
        wallet: safeWallet,
        actorUserId: params.user.userId as UUID,
        sessionId: params.sessionId as UUID | undefined,
      })
      currencyUpdated = true
    }
  }

  // ─── Audit log ─────────────────────────────────────────────────────────────

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
        inventoryItemsUpserted,
        currencyUpdated,
      },
    },
  })

  return {
    ok: true,
    applied: {
      characterUpdate: Boolean(params.characterUpdate),
      campaignUpdate: Boolean(params.campaignUpdate),
      inventoryItemsUpserted,
      currencyUpdated,
    },
  }
}
