/**
 * Campaign Session Routes (Extension-facing)
 *
 * Mounted at /api/campaigns. Provides read-only session status and the
 * idempotent session-ensure endpoint used by the browser extension popup
 * and launch flow (docs/extension/EXTENSION-INTEGRATION.md §5a, §10b;
 * docs/extension/GUEST-AUTH.md §4.10).
 *
 * GET  /:campaignId/session-status  — current session state, no auth required
 * POST /:campaignId/session/ensure  — ensure an IDLE session exists; requires campaign membership
 */

import { Router, Request, Response, NextFunction } from 'express'
import { getPrismaClient } from '@/infra/db'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { createSession } from '@/services/session/core.service'
import { ensureSessionDefaultRoomsForSession } from '@/services/room.service'
import { listSessionsByCampaign } from '@/repositories/session.repository'
import { deriveCampaignDisplayState, isValidUUID, type SessionLifecycleState } from '@shared'
import { ErrorCode } from '@shared'
import type { UUID } from '@shared'

const router = Router()
const prisma = getPrismaClient()

/** Active session states — any of these means a session is in progress or queued. */
const ACTIVE_STATES = new Set(['IDLE', 'ACTIVE', 'PAUSED', 'COOLDOWN'])

/**
 * Finds the most recent session for a campaign that is in an active state
 * (IDLE, ACTIVE, PAUSED, or COOLDOWN). Returns null when only ENDED/CLEANUP
 * sessions exist or when the campaign has no sessions at all.
 */
async function findActiveSession(campaignId: string) {
  const sessions = await listSessionsByCampaign(campaignId)
  return sessions.find((s) => ACTIVE_STATES.has(s.state)) ?? null
}

// ---------------------------------------------------------------------------
// GET /:campaignId/session-status
// Public endpoint — campaignId acts as the access gate (no token required).
// Used by the extension popup to display current session state before launch.
// ---------------------------------------------------------------------------

router.get('/:campaignId/session-status', async (req: Request, res: Response) => {
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'campaignId must be a valid UUID',
    })
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  })

  if (!campaign) {
    return res.status(404).json({
      code: 'CAMPAIGN_NOT_FOUND',
      message: 'Campaign not found',
    })
  }

  const session = await findActiveSession(campaignId)

  return res.status(200).json({
    sessionId: session?.id ?? null,
    sessionState: session?.state ?? null,
    campaignDisplayState: deriveCampaignDisplayState(
      (session?.state ?? null) as SessionLifecycleState | null
    ),
  })
})

// ---------------------------------------------------------------------------
// POST /:campaignId/session/ensure
// Requires a valid JWT for a member of the campaign.
// Creates an IDLE session if none exists; returns the existing session otherwise.
// Any campaign member (including guests) may call this — DM controls remain DM-only.
// ---------------------------------------------------------------------------

function requireCampaignMember(req: Request, res: Response, next: NextFunction) {
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
      .json({ code: ErrorCode.UNAUTHORIZED, message: 'Invalid or expired token' })
  }

  ;(req as any).user = user
  next()
}

router.post(
  '/:campaignId/session/ensure',
  requireCampaignMember,
  async (req: Request, res: Response) => {
    const { campaignId } = req.params
    const user = (req as any).user

    if (!isValidUUID(campaignId)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'campaignId must be a valid UUID',
      })
    }

    const membership = await prisma.campaignMembership.findUnique({
      where: { campaignId_userId: { campaignId, userId: user.userId } },
      include: { campaign: { select: { id: true, currentDmId: true } } },
    })

    if (!membership) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Not a member of this campaign',
      })
    }

    const existing = await findActiveSession(campaignId)
    if (existing) {
      return res.status(200).json({
        sessionId: existing.id,
        sessionState: existing.state,
        campaignDisplayState: deriveCampaignDisplayState(existing.state as SessionLifecycleState),
      })
    }

    // No active session — create a fresh IDLE session (greenroom). Any member may do this;
    // DM session controls (ACTIVE/PAUSED/etc.) still require the DM role.
    const dmId = membership.campaign.currentDmId ?? user.userId
    const session = await createSession(
      `Session - ${new Date().toLocaleDateString('en-AU')}`,
      dmId as UUID,
      undefined,
      campaignId as UUID
    )

    await ensureSessionDefaultRoomsForSession(session.id as UUID, session.dmId as UUID)

    return res.status(201).json({
      sessionId: session.id,
      sessionState: session.state,
      campaignDisplayState: deriveCampaignDisplayState(session.state),
    })
  }
)

export default router
