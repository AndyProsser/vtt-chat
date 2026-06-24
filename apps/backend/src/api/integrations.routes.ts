import { Request, Response, Router, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { ErrorCode, isValidUUID } from '@shared'
import { logger } from '@/utils'
import type { UUID } from '@shared'
import { getSessionPresence } from '@/services/room.service'
import { listSessionsByCampaign } from '@/repositories/session.repository'
import { syncExternalIntegration } from '@/services/integration-sync.service'
import { dmCampaignSync } from '@/services/dm-campaign-sync.service'
import { appendSessionAuditEvent } from '@/services/runtime/runtime-streams.service'
import { broadcastPresenceProfileUpdate } from '@/services/session/presence-profile-broadcast.service'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

const router = Router()

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Missing Authorization header' })
  }

  const user = verifyToken(token)
  if (!user) {
    return res
      .status(401)
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' })
  }

  ;(req as any).user = user
  next()
}

/**
 * POST /api/integrations/external/sync
 *
 * Pushes character or campaign data updates from the extension.
 * Applies updates based on the campaign's `extensionSyncPolicy` and the caller's role.
 *
 * Requires authentication (guest or full token).
 */
router.post('/external/sync', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const {
    campaignId,
    externalSystem,
    source,
    characterUpdate,
    campaignUpdate,
    inventoryUpdate,
    currencyUpdate,
    partyInventoryUpdate,
    partyCurrencyUpdate,
    sessionId,
  } = req.body || {}

  // Validate required fields
  if (!campaignId || typeof campaignId !== 'string' || !isValidUUID(campaignId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'campaignId must be a valid UUID',
      field: 'campaignId',
    })
  }

  if (!externalSystem || typeof externalSystem !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'externalSystem is required',
      field: 'externalSystem',
    })
  }

  if (!source || !['player', 'dm'].includes(source)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'source must be "player" or "dm"',
      field: 'source',
    })
  }

  try {
    // Normalise DnD Beyond field aliases before passing to the sync service.
    // Extension sends currencyUpdate.currency (not .wallet) and items[].id (not .externalId).
    const normalisedCurrencyUpdate =
      currencyUpdate && typeof currencyUpdate === 'object'
        ? { ...currencyUpdate, wallet: currencyUpdate.wallet ?? currencyUpdate.currency }
        : currencyUpdate

    const normalisedPartyCurrencyUpdate =
      partyCurrencyUpdate && typeof partyCurrencyUpdate === 'object'
        ? { ...partyCurrencyUpdate, wallet: partyCurrencyUpdate.wallet ?? partyCurrencyUpdate.currency }
        : partyCurrencyUpdate

    const result = await syncExternalIntegration({
      campaignId,
      externalSystem,
      source,
      user: {
        userId: user.userId,
        username: user.username,
        role: user.role,
        adminRole: user.adminRole,
      },
      characterUpdate,
      campaignUpdate,
      inventoryUpdate,
      currencyUpdate: normalisedCurrencyUpdate,
      partyInventoryUpdate,
      partyCurrencyUpdate: normalisedPartyCurrencyUpdate,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
    })

    if (!result.ok) {
      if (result.code === 'INVALID_CHARACTER_UPDATE') {
        return res.status(400).json({
          code: ErrorCode.INVALID_INPUT,
          message: result.message,
          field: result.field,
        })
      }

      // FORBIDDEN, SYNC_POLICY_VIOLATION, SYNC_POLICY_DISABLED, SYNC_POLICY_PARTY_ACCESS_DENIED
      return res.status(403).json({
        code: result.code,
        message: result.message,
      })
    }

    const wsManager = req.app.locals.wsManager as
      | Pick<import('@/ws').WebSocketManager, 'broadcastEventToSession'>
      | undefined

    const hasSyncPayload =
      (characterUpdate && typeof characterUpdate === 'object') ||
      (inventoryUpdate && typeof inventoryUpdate === 'object') ||
      (currencyUpdate && typeof currencyUpdate === 'object') ||
      (partyInventoryUpdate && typeof partyInventoryUpdate === 'object') ||
      (partyCurrencyUpdate && typeof partyCurrencyUpdate === 'object')

    if (wsManager && hasSyncPayload) {
      const updatedAt = Date.now()
      const sessions = await listSessionsByCampaign(campaignId)

      for (const session of sessions) {
        const presence = await getSessionPresence(session.id as UUID)
        if (!presence.some((entry) => entry.userId === user.userId)) {
          continue
        }

        await appendSessionAuditEvent({
          sessionId: session.id as UUID,
          campaignId,
          actorUserId: user.userId,
          actorRole: user.role,
          actionType: 'INTEGRATIONS.EXTERNAL_SYNCED',
          targetType: 'INTEGRATION_PROFILE',
          targetId: user.userId,
          visibilityClass: 'ROLE_SCOPED',
          metadata: {
            externalSystem,
            source,
            hasCharacterUpdate: Boolean(characterUpdate),
            hasCampaignUpdate: Boolean(campaignUpdate),
            inventoryItemsUpserted: result.applied.inventoryItemsUpserted,
            currencyUpdated: result.applied.currencyUpdated,
          },
        })
      }

      // Only broadcast when the character was found by externalId and actually updated.
      // If characterUpdateApplied is false the character wasn't in the DB (externalId
      // mismatch), so nothing changed — broadcasting would send characterStats: null and
      // silently wipe stats from every connected client's Zustand store.
      if (characterUpdate && typeof characterUpdate === 'object' && result.applied.characterUpdateApplied !== false) {
        await broadcastPresenceProfileUpdate({
          wsManager,
          sessionIds: sessions.map((session) => session.id as UUID),
          userId: user.userId,
          username: user.username,
          userRole: user.role,
          updatedAt,
        })
      }
    }

    return res.status(200).json({
      message: 'Sync completed successfully',
      applied: result.applied,
    })
  } catch (err) {
    logger.error('integrations', 'Unhandled error in POST /external/sync', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to sync external data',
    })
  }
})

/**
 * POST /api/integrations/external/dm-sync
 *
 * DM-triggered full campaign sync. Provisions unowned stub characters for players
 * who don't have VTT-Chat accounts yet, and upserts characters for known players.
 *
 * Requires DM authentication. Rejects with 403 if the caller is not the campaign DM.
 */
router.post('/external/dm-sync', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user

  // DM sync is a privileged campaign operation. Guest tokens are not accepted.
  if (user.authType !== 'FULL') {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message:
        'A full vtt-chat account is required to run a DM campaign sync. Guest tokens are not accepted.',
    })
  }

  const { campaignId, externalSystem, externalCampaignId, campaignData, characters } = req.body || {}

  if (!campaignId || typeof campaignId !== 'string' || !isValidUUID(campaignId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'campaignId must be a valid UUID',
      field: 'campaignId',
    })
  }

  if (!externalSystem || typeof externalSystem !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'externalSystem is required',
      field: 'externalSystem',
    })
  }

  if (!externalCampaignId || typeof externalCampaignId !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'externalCampaignId is required',
      field: 'externalCampaignId',
    })
  }

  // Verify caller is the DM of the specified campaign.
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { currentDmId: true, supportedPlatforms: true },
  })

  if (!campaign) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Campaign not found or access denied',
    })
  }

  if (campaign.currentDmId !== user.userId) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only the campaign DM may perform a DM campaign sync',
    })
  }

  try {
    const result = await dmCampaignSync({
      campaignId,
      externalSystem,
      externalCampaignId,
      campaignData: campaignData && typeof campaignData === 'object' ? campaignData : undefined,
      characters: Array.isArray(characters) ? characters : [],
      actorUserId: user.userId,
      actorUsername: user.username,
    })

    return res.status(200).json({
      message: 'DM campaign sync completed',
      applied: result.applied,
    })
  } catch (err) {
    logger.error('integrations', 'Unhandled error in POST /external/dm-sync', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to complete DM campaign sync',
    })
  }
})

export default router
