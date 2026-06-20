import { Request, Response, Router, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { ErrorCode, isValidUUID } from '@shared'
import type { UUID } from '@shared'
import { getSessionPresence } from '@/services/room.service'
import { listSessionsByCampaign } from '@/repositories/session.repository'
import { syncExternalIntegration } from '@/services/integration-sync.service'
import { appendSessionAuditEvent } from '@/services/runtime/runtime-streams.service'
import { broadcastPresenceProfileUpdate } from '@/services/session/presence-profile-broadcast.service'

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
      currencyUpdate,
      partyInventoryUpdate,
      partyCurrencyUpdate,
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
  } catch {
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to sync external data',
    })
  }
})

export default router
