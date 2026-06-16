import { getPrismaClient } from '@/infra/db'
import type { UUID } from '@shared'
import type { ExternalSyncResult } from '@/types/integration-sync.types'
import {
  sanitizeExternalItems,
  sanitizeExternalWallet,
  applyItemsSection,
  applyCurrencySection,
} from '@/services/integration-sync-policy.service'

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

export interface ExternalPartyInventoryUpdate {
  items: ExternalInventoryItemInput[]
}

export interface ExternalPartyCurrencyUpdate {
  wallet: {
    cp?: number
    sp?: number
    ep?: number
    gp?: number
    pp?: number
  }
}

/** Maps each gated section name to the ad-hoc skip-reason code recorded for it, if blocked. */
type GatedSection = 'inventory' | 'currency' | 'partyInventory' | 'partyCurrency'

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
  partyInventoryUpdate?: ExternalPartyInventoryUpdate
  partyCurrencyUpdate?: ExternalPartyCurrencyUpdate
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
          extensionInventorySyncEnabled: true,
          extensionCurrencySyncEnabled: true,
          extensionPartyInventorySyncAccess: true,
          extensionSyncConflictResolution: true,
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

  // ─── Layer 1: top-level access gate ─────────────────────────────────────────

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

  // ─── Layer 2: inventory-specific gates ──────────────────────────────────────
  // Four campaign settings, evaluated independently per section. A request that contains
  // ONLY gated sections, all of which are blocked, is rejected wholesale; otherwise allowed
  // sections (including characterUpdate/campaignUpdate) still apply and skipped sections are
  // reported via `applied.skippedReasons` (partial application).

  const hasCharacterUpdate = Boolean(params.characterUpdate && typeof params.characterUpdate === 'object')
  const hasCampaignUpdate = Boolean(params.campaignUpdate && typeof params.campaignUpdate === 'object')
  const hasInventory = Boolean(params.inventoryUpdate && typeof params.inventoryUpdate === 'object')
  const hasCurrency = Boolean(params.currencyUpdate && typeof params.currencyUpdate === 'object')
  const hasPartyInventory = Boolean(params.partyInventoryUpdate && typeof params.partyInventoryUpdate === 'object')
  const hasPartyCurrency = Boolean(params.partyCurrencyUpdate && typeof params.partyCurrencyUpdate === 'object')

  const inventoryDisabled = !campaign.extensionInventorySyncEnabled
  const currencyDisabled = !campaign.extensionCurrencySyncEnabled
  const partyAccess = campaign.extensionPartyInventorySyncAccess
  const partyBlocked = partyAccess === 'DISABLED' || (partyAccess === 'DM_ONLY' && params.source !== 'dm')

  const skippedReasons: Partial<Record<GatedSection, 'SYNC_POLICY_DISABLED' | 'SYNC_POLICY_PARTY_ACCESS_DENIED'>> = {}
  if (hasInventory && inventoryDisabled) skippedReasons.inventory = 'SYNC_POLICY_DISABLED'
  if (hasCurrency && currencyDisabled) skippedReasons.currency = 'SYNC_POLICY_DISABLED'
  if (hasPartyInventory) {
    if (inventoryDisabled) skippedReasons.partyInventory = 'SYNC_POLICY_DISABLED'
    else if (partyBlocked) skippedReasons.partyInventory = 'SYNC_POLICY_PARTY_ACCESS_DENIED'
  }
  if (hasPartyCurrency) {
    if (currencyDisabled) skippedReasons.partyCurrency = 'SYNC_POLICY_DISABLED'
    else if (partyBlocked) skippedReasons.partyCurrency = 'SYNC_POLICY_PARTY_ACCESS_DENIED'
  }

  const gatedSections: GatedSection[] = []
  if (hasInventory) gatedSections.push('inventory')
  if (hasCurrency) gatedSections.push('currency')
  if (hasPartyInventory) gatedSections.push('partyInventory')
  if (hasPartyCurrency) gatedSections.push('partyCurrency')

  if (
    !hasCharacterUpdate &&
    !hasCampaignUpdate &&
    gatedSections.length > 0 &&
    gatedSections.every((section) => skippedReasons[section])
  ) {
    const isDisabled = gatedSections.some((section) => skippedReasons[section] === 'SYNC_POLICY_DISABLED')
    return {
      ok: false,
      code: isDisabled ? 'SYNC_POLICY_DISABLED' : 'SYNC_POLICY_PARTY_ACCESS_DENIED',
      message: isDisabled
        ? 'Inventory or currency sync is disabled for this campaign'
        : 'Party inventory/currency sync is not permitted for this caller',
    }
  }

  // ─── Character sync ──────────────────────────────────────────────────────────

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

  // ─── Inventory sync (character-owned) ───────────────────────────────────────

  let inventoryItemsUpserted = 0
  let pendingConflicts = 0

  if (hasInventory && !skippedReasons.inventory) {
    const { externalCharacterId, items } = params.inventoryUpdate!

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
      const validatedItems = sanitizeExternalItems(items)
      if (validatedItems.length > 0) {
        const { upserted, pendingConflicts: queued } = await applyItemsSection({
          campaignId: params.campaignId as UUID,
          ownerId: character.id as UUID,
          ownerType: 'character',
          externalSource: params.externalSystem,
          items: validatedItems,
          conflictResolution: campaign.extensionSyncConflictResolution,
          actorUserId: params.user.userId as UUID,
          sessionId: params.sessionId as UUID | undefined,
          characterIdForPending: character.id as UUID,
          dmUserId: campaign.currentDmId as UUID,
        })
        inventoryItemsUpserted = upserted
        pendingConflicts += queued
      }
    }
  }

  // ─── Currency sync (character-owned) ────────────────────────────────────────

  let currencyUpdated = false

  if (hasCurrency && !skippedReasons.currency) {
    const { externalCharacterId, wallet } = params.currencyUpdate!

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
      const { updated, pendingConflicts: queued } = await applyCurrencySection({
        campaignId: params.campaignId as UUID,
        ownerId: character.id as UUID,
        ownerType: 'character',
        externalSource: params.externalSystem,
        wallet: sanitizeExternalWallet(wallet),
        conflictResolution: campaign.extensionSyncConflictResolution,
        actorUserId: params.user.userId as UUID,
        sessionId: params.sessionId as UUID | undefined,
        characterIdForPending: character.id as UUID,
        dmUserId: campaign.currentDmId as UUID,
      })
      currencyUpdated = updated
      pendingConflicts += queued
    }
  }

  // ─── Party inventory sync ────────────────────────────────────────────────────

  let partyInventoryItemsUpserted = 0

  if (hasPartyInventory && !skippedReasons.partyInventory) {
    const { items } = params.partyInventoryUpdate!

    if (!Array.isArray(items) || items.length === 0) {
      return {
        ok: false,
        code: 'INVALID_CHARACTER_UPDATE',
        message: 'partyInventoryUpdate.items must be a non-empty array',
        field: 'partyInventoryUpdate.items',
      }
    }

    const validatedItems = sanitizeExternalItems(items)
    if (validatedItems.length > 0) {
      const { upserted, pendingConflicts: queued } = await applyItemsSection({
        campaignId: params.campaignId as UUID,
        ownerId: null,
        ownerType: 'party',
        externalSource: params.externalSystem,
        items: validatedItems,
        conflictResolution: campaign.extensionSyncConflictResolution,
        actorUserId: params.user.userId as UUID,
        sessionId: params.sessionId as UUID | undefined,
        characterIdForPending: null,
        dmUserId: campaign.currentDmId as UUID,
      })
      partyInventoryItemsUpserted = upserted
      pendingConflicts += queued
    }
  }

  // ─── Party currency sync ─────────────────────────────────────────────────────

  let partyCurrencyUpdated = false

  if (hasPartyCurrency && !skippedReasons.partyCurrency) {
    const { wallet } = params.partyCurrencyUpdate!

    if (wallet && typeof wallet === 'object') {
      const { updated, pendingConflicts: queued } = await applyCurrencySection({
        campaignId: params.campaignId as UUID,
        ownerId: null,
        ownerType: 'party',
        externalSource: params.externalSystem,
        wallet: sanitizeExternalWallet(wallet),
        conflictResolution: campaign.extensionSyncConflictResolution,
        actorUserId: params.user.userId as UUID,
        sessionId: params.sessionId as UUID | undefined,
        characterIdForPending: null,
        dmUserId: campaign.currentDmId as UUID,
      })
      partyCurrencyUpdated = updated
      pendingConflicts += queued
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
        partyInventoryItemsUpserted,
        partyCurrencyUpdated,
        pendingConflicts,
      },
    },
  })

  // ─── Response shape ──────────────────────────────────────────────────────────
  // characterUpdate/campaignUpdate are always present (existing contract). Every other key is
  // only present when its corresponding request section was present, matching the partial
  // application example in docs/extension/EXTENSION-INTEGRATION.md §5d.

  const applied = {
    characterUpdate: Boolean(params.characterUpdate),
    campaignUpdate: Boolean(params.campaignUpdate),
    ...(hasInventory ? { inventoryItemsUpserted } : {}),
    ...(hasCurrency ? { currencyUpdated } : {}),
    ...(hasPartyInventory ? { partyInventoryItemsUpserted } : {}),
    ...(hasPartyCurrency ? { partyCurrencyUpdated } : {}),
    ...(pendingConflicts > 0 ? { pendingConflicts } : {}),
    ...(Object.keys(skippedReasons).length > 0 ? { skippedReasons } : {}),
  }

  return { ok: true, applied }
}
