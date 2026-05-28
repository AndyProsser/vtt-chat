/**
 * Campaign Discovery & Lifecycle Routes
 *
 * All routes that extend campaign functionality beyond the original campaign.routes.ts.
 * Mounted at /api/campaigns by api/index.ts.
 *
 * Routes covered:
 *   GET  /discover                          — list discoverable non-member campaigns
 *   POST /:id/join-request                  — submit a join request (full user, PUBLIC campaign)
 *   POST /:id/join-request/:requestId/approve — DM approves a pending join request
 *   POST /:id/join-request/:requestId/reject  — DM rejects a pending join request
 *   POST /:id/watch                         — linkless WATCH entry (non-member, PRIVATE watchable)
 *   POST /:id/retire                        — DM retires a campaign (soft-delete)
 *   POST /:id/resume                        — DM resumes a retired campaign
 *   DELETE /:id                             — DM deletes a campaign (hard in DEV, soft in PROD)
 */

import { Router, Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { ErrorCode, isValidUUID } from '@shared'
import type { EventEnvelope, UUID } from '@shared'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getPrismaClient } from '@/infra/db'
import {
  listDiscoverableCampaigns,
  createJoinRequest,
  resolveJoinRequest,
  retireCampaign,
  resumeCampaign,
  deleteCampaign,
  getCampaignDmId,
  listCampaignMemberIds,
} from '@/repositories/campaign.repository'
import eventBroadcaster from '@/ws/event-broadcaster'
import type { TokenPayload } from '@/services/auth.service'

const router = Router()
const prisma = getPrismaClient()

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

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

function getUser(req: Request): TokenPayload {
  return (req as any).user as TokenPayload
}

// ---------------------------------------------------------------------------
// Event envelope builder (campaign-scoped; no session/room context)
// ---------------------------------------------------------------------------

function makeCampaignEvent(
  type: string,
  userId: UUID,
  payload: Record<string, unknown>
): EventEnvelope {
  return {
    id: randomUUID() as UUID,
    type: type as EventEnvelope['type'],
    version: 1,
    userId,
    userRole: 'SYSTEM' as any,
    sessionId: null as unknown as UUID,
    roomId: null,
    timestamp: Date.now(),
    payload,
  }
}

// ---------------------------------------------------------------------------
// GET /discover — list discoverable campaigns the user is NOT a member of
// ---------------------------------------------------------------------------

router.get('/discover', requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req)
  const campaigns = await listDiscoverableCampaigns(user.userId as UUID)
  return res.status(200).json({ campaigns })
})

// ---------------------------------------------------------------------------
// POST /:id/join-request — submit a join request for a PUBLIC campaign
// ---------------------------------------------------------------------------

router.post('/:id/join-request', requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req)
  const campaignId = req.params.id

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaign id' })
  }

  // Only FULL users may submit join requests
  if ((user as any).authType === 'GUEST') {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message:
        'Guest accounts cannot request to join campaigns. Please create a full account first.',
    })
  }

  const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : undefined
  const message = rawMessage && rawMessage.length > 0 ? rawMessage.slice(0, 300) : undefined

  const result = await createJoinRequest({ campaignId, userId: user.userId as UUID, message })

  if ('error' in result) {
    const errorMap: Record<string, [number, string]> = {
      ALREADY_MEMBER: [409, 'You are already a member of this campaign.'],
      NOT_DISCOVERABLE: [403, 'This campaign is not open for join requests.'],
      ALREADY_PENDING: [409, 'You already have a pending request for this campaign.'],
      RETIRED: [410, 'This campaign has been retired.'],
    }
    const [status, message] = errorMap[result.error] ?? [500, 'Unexpected error']
    return res.status(status).json({ code: ErrorCode.FORBIDDEN, message })
  }

  // Fetch requester display info for the DM notification
  const requester = await prisma.user.findUnique({
    where: { id: user.userId as UUID },
    select: { displayName: true, avatarUrl: true },
  })

  // Count pending requests so the DM badge stays current
  const pendingCount = await prisma.campaignJoinRequest.count({
    where: { campaignId, status: 'PENDING' },
  })

  const dmId = await getCampaignDmId(campaignId)
  if (dmId && eventBroadcaster.isReady()) {
    const event = makeCampaignEvent('CAMPAIGN:JOIN_REQUEST_RECEIVED', user.userId as UUID, {
      campaignId,
      requestId: result.id,
      userId: user.userId,
      displayName: requester?.displayName ?? user.userId,
      avatarUrl: requester?.avatarUrl ?? null,
      requestedAt: result.requestedAt.toISOString(),
      message: result.message ?? null,
      pendingCount,
    })
    eventBroadcaster.sendToUser(dmId as UUID, event)
  }

  return res.status(201).json({ requestId: result.id })
})

// ---------------------------------------------------------------------------
// POST /:id/join-request/:requestId/approve — DM approves a join request
// ---------------------------------------------------------------------------

router.post(
  '/:id/join-request/:requestId/approve',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = getUser(req)
    const { id: campaignId, requestId } = req.params

    if (!isValidUUID(campaignId) || !isValidUUID(requestId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid id' })
    }

    const dmId = await getCampaignDmId(campaignId)
    if (dmId !== user.userId) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the campaign DM can approve join requests.',
      })
    }

    const result = await resolveJoinRequest({ requestId, campaignId, resolution: 'APPROVED' })

    if ('error' in result) {
      const errorMap: Record<string, [number, string]> = {
        NOT_FOUND: [404, 'Join request not found.'],
        NOT_PENDING: [409, 'This request has already been resolved.'],
      }
      const [status, message] = errorMap[result.error] ?? [500, 'Unexpected error']
      return res.status(status).json({ code: ErrorCode.FORBIDDEN, message })
    }

    // Fetch campaign name for the notification
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true },
    })

    if (eventBroadcaster.isReady()) {
      const event = makeCampaignEvent('CAMPAIGN:JOIN_REQUEST_RESOLVED', user.userId as UUID, {
        campaignId,
        requestId,
        resolution: 'APPROVED',
        campaignName: campaign?.name ?? '',
      })
      eventBroadcaster.sendToUser(result.userId as UUID, event)
    }

    return res.status(200).json({ ok: true })
  }
)

// ---------------------------------------------------------------------------
// POST /:id/join-request/:requestId/reject — DM rejects a join request
// ---------------------------------------------------------------------------

router.post(
  '/:id/join-request/:requestId/reject',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = getUser(req)
    const { id: campaignId, requestId } = req.params

    if (!isValidUUID(campaignId) || !isValidUUID(requestId)) {
      return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid id' })
    }

    const dmId = await getCampaignDmId(campaignId)
    if (dmId !== user.userId) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the campaign DM can reject join requests.',
      })
    }

    const result = await resolveJoinRequest({ requestId, campaignId, resolution: 'REJECTED' })

    if ('error' in result) {
      const errorMap: Record<string, [number, string]> = {
        NOT_FOUND: [404, 'Join request not found.'],
        NOT_PENDING: [409, 'This request has already been resolved.'],
      }
      const [status, message] = errorMap[result.error] ?? [500, 'Unexpected error']
      return res.status(status).json({ code: ErrorCode.FORBIDDEN, message })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { name: true },
    })

    if (eventBroadcaster.isReady()) {
      const event = makeCampaignEvent('CAMPAIGN:JOIN_REQUEST_RESOLVED', user.userId as UUID, {
        campaignId,
        requestId,
        resolution: 'REJECTED',
        campaignName: campaign?.name ?? '',
      })
      eventBroadcaster.sendToUser(result.userId as UUID, event)
    }

    return res.status(200).json({ ok: true })
  }
)

// ---------------------------------------------------------------------------
// POST /:id/watch — linkless WATCH entry for PRIVATE watchable campaigns
// ---------------------------------------------------------------------------

router.post('/:id/watch', requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req)
  const campaignId = req.params.id

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaign id' })
  }

  // Only FULL users may use linkless watch (GUESTS must use invite-based watch flow)
  if ((user as any).authType === 'GUEST') {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Guest accounts must use a watch invite link to join as spectator.',
    })
  }

  // Validate all watch conditions
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      sessions: {
        where: { state: 'ACTIVE' },
        select: {
          id: true,
          state: true,
          presence: { select: { userId: true, state: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      members: { select: { userId: true, role: true } },
    },
  })

  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found.' })
  }
  if (campaign.retiredAt !== null) {
    return res
      .status(410)
      .json({ code: ErrorCode.FORBIDDEN, message: 'This campaign has been retired.' })
  }
  if (campaign.spectatorPolicy === 'NONE') {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'This campaign does not allow spectators.' })
  }

  const activeSession = campaign.sessions[0]
  if (!activeSession) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'No active session. Watch is only available during a live session.',
    })
  }

  const onlineUserIds = new Set<string>(
    (activeSession.presence || [])
      .filter((p: { state: string }) => p.state === 'ONLINE')
      .map((p: { userId: string }) => p.userId)
  )
  const roleByUserId = new Map<string, string>(
    (campaign.members || []).map((m: { userId: string; role: string }) => [m.userId, m.role])
  )
  const dmOnline = onlineUserIds.has(campaign.currentDmId)
  const playersOnline = Array.from(onlineUserIds).filter(
    (id) => roleByUserId.get(id) === 'PLAYER'
  ).length

  if (dmOnline === false && playersOnline === 0) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message:
        'No DM or players are currently online. Watch is available once the session is active.',
    })
  }

  // Check if user is already a member (members use the normal entry flow)
  const existingMembership = await prisma.campaignMembership.findUnique({
    where: { campaignId_userId: { campaignId, userId: user.userId as UUID } },
  })
  if (existingMembership) {
    return res.status(409).json({
      code: ErrorCode.FORBIDDEN,
      message: 'You are already a member of this campaign. Use the normal campaign entry flow.',
    })
  }

  // Create/update spectator membership + session presence
  await prisma.$transaction(async (tx) => {
    await tx.campaignMembership.upsert({
      where: { campaignId_userId: { campaignId, userId: user.userId as UUID } },
      create: { campaignId, userId: user.userId as UUID, role: 'SPECTATOR' },
      update: { role: 'SPECTATOR' },
    })
  })

  // Return the session id so the frontend can connect to the LiveKit room
  return res.status(200).json({ sessionId: activeSession.id, campaignId })
})

// ---------------------------------------------------------------------------
// POST /:id/retire — DM retires a campaign
// ---------------------------------------------------------------------------

router.post('/:id/retire', requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req)
  const campaignId = req.params.id

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaign id' })
  }

  const dmId = await getCampaignDmId(campaignId)
  if (dmId !== user.userId) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only the campaign DM can retire this campaign.',
    })
  }

  const result = await retireCampaign(campaignId)

  if ('error' in result) {
    const errorMap: Record<string, [number, string]> = {
      NOT_FOUND: [404, 'Campaign not found.'],
      ACTIVE_SESSION: [
        409,
        'Cannot retire a campaign while a session is active or paused. End the session first.',
      ],
      ALREADY_RETIRED: [409, 'This campaign is already retired.'],
    }
    const [status, message] = errorMap[result.error] ?? [500, 'Unexpected error']
    return res.status(status).json({ code: ErrorCode.FORBIDDEN, message })
  }

  // Notify all campaign members so their lobby cards update immediately
  if (eventBroadcaster.isReady()) {
    const event = makeCampaignEvent('CAMPAIGN:RETIRED', user.userId as UUID, {
      campaignId,
      retiredAt: result.retiredAt.toISOString(),
    })
    await eventBroadcaster.broadcastToCampaignMembers(campaignId as UUID, event)
  }

  return res.status(200).json({ ok: true, retiredAt: result.retiredAt })
})

// ---------------------------------------------------------------------------
// POST /:id/resume — DM resumes a retired campaign
// ---------------------------------------------------------------------------

router.post('/:id/resume', requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req)
  const campaignId = req.params.id

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaign id' })
  }

  const dmId = await getCampaignDmId(campaignId)
  if (dmId !== user.userId) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only the campaign DM can resume this campaign.',
    })
  }

  const result = await resumeCampaign(campaignId)

  if ('error' in result) {
    const errorMap: Record<string, [number, string]> = {
      NOT_FOUND: [404, 'Campaign not found.'],
      NOT_RETIRED: [409, 'This campaign is not retired.'],
    }
    const [status, message] = errorMap[result.error] ?? [500, 'Unexpected error']
    return res.status(status).json({ code: ErrorCode.FORBIDDEN, message })
  }

  if (eventBroadcaster.isReady()) {
    const event = makeCampaignEvent('CAMPAIGN:RESUMED', user.userId as UUID, {
      campaignId,
    })
    await eventBroadcaster.broadcastToCampaignMembers(campaignId as UUID, event)
  }

  return res.status(200).json({ ok: true })
})

// ---------------------------------------------------------------------------
// DELETE /:id — DM deletes a campaign
// DEV:  hard delete (row removed permanently)
// PROD: soft delete (deletedAt timestamp set; admin can restore)
// Blocked when an active or paused session exists.
// ---------------------------------------------------------------------------

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = getUser(req)
  const campaignId = req.params.id

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaign id' })
  }

  const dmId = await getCampaignDmId(campaignId)
  if (dmId !== user.userId) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only the campaign DM can delete this campaign.',
    })
  }

  const hard = process.env.NODE_ENV === 'development'
  const result = await deleteCampaign(campaignId, { hard })

  if ('error' in result) {
    const errorMap: Record<string, [number, string]> = {
      NOT_FOUND: [404, 'Campaign not found.'],
      ACTIVE_SESSION: [409, 'Cannot delete a campaign with an active or paused session.'],
      ALREADY_DELETED: [409, 'This campaign has already been deleted.'],
    }
    const [status, message] = errorMap[result.error] ?? [500, 'Unexpected error']
    return res.status(status).json({ code: ErrorCode.FORBIDDEN, message })
  }

  // Notify all members that the campaign is gone before they lose access
  if (eventBroadcaster.isReady()) {
    const event = makeCampaignEvent('CAMPAIGN:DELETED', user.userId as UUID, { campaignId })
    await eventBroadcaster.broadcastToCampaignMembers(campaignId as UUID, event)
  }

  return res.status(200).json({ ok: true })
})

export default router
