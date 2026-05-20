import { Router, Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { getPrismaClient } from '@/infra/db'
import { ErrorCode, isValidSessionName, isValidUUID } from '@shared'
import type { UUID } from '@shared'
import { createToken, extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { createSession } from '@/services/session/core.service'
import { ensureSessionDefaultRoomsForSession, getSessionPresence } from '@/services/room.service'
import { listSessionsByCampaign } from '@/repositories/session.repository'
import { countSessionCooldownExtensions } from '@/services/session/logs.service'
import { restoreRememberedDevMockPlayersForSession } from '@/services/dev-mock/players.service'
import {
  createCampaignForUser,
  createCharacterForCampaign,
  getCampaignForUser,
  isUserInCampaign,
  joinCampaignForUser,
  listCampaignsForUser,
  updateCharacterForCampaignMember,
} from '@/repositories/campaign.repository'
import {
  browseSpectatorCampaignsForUser,
  getSpectatorWaitlistStatus,
  validatePlayerInviteCode,
  validateSpectatorInviteCode,
} from '@/services/guest-auth'
import { randomOpaqueToken } from '@/utils/guest-auth.helpers'
import {
  listCampaignExternalLinks,
  upsertCampaignExternalLink,
} from '@/services/campaign-external-links.service'
import { deriveCampaignJoinRole } from '@/services/session/authz.service'
import {
  SESSION_COOLDOWN_EXTENSION_MAX_MS,
  SESSION_COOLDOWN_EXTENSION_MIN_MS,
} from '@/constants/session.constants'
import eventBroadcaster from '@/ws/event-broadcaster'

const router = Router()
const prisma = getPrismaClient()

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

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

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const campaigns = await listCampaignsForUser(user.userId as UUID)
  res.status(200).json({ campaigns })
})

router.get('/invite/:code/validate', async (req: Request, res: Response) => {
  const code = String(req.params.code || '').trim()

  if (!code) {
    return res.status(400).json({
      valid: false,
      reason: 'INVITE_EXPIRED',
    })
  }

  const result = await validatePlayerInviteCode(code)
  return res.status(result.valid ? 200 : 404).json(result)
})

router.get('/watch/:code/validate', async (req: Request, res: Response) => {
  const code = String(req.params.code || '').trim()

  if (!code) {
    return res.status(400).json({
      valid: false,
      reason: 'INVITE_EXPIRED',
    })
  }

  const result = await validateSpectatorInviteCode(code)
  return res.status(result.valid ? 200 : 404).json(result)
})

router.post('/watch/:code/join', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const code = String(req.params.code || '')
    .trim()
    .toUpperCase()

  if (!code) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Spectator invite code is required',
      field: 'code',
    })
  }

  const requester = await prisma.user.findUnique({
    where: { id: user.userId as UUID },
    select: {
      id: true,
      username: true,
      displayName: true,
      authType: true,
      isActive: true,
    },
  })

  if (!requester || !requester.isActive) {
    return res.status(404).json({
      code: ErrorCode.NOT_FOUND,
      message: 'User not found',
    })
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      spectatorInviteCode: code,
      spectatorInviteActive: true,
    },
    select: {
      id: true,
      spectatorPolicy: true,
      spectatorMax: true,
      spectatorWaitlistEnabled: true,
      sessions: {
        where: {
          state: 'ACTIVE',
        },
        select: {
          id: true,
          members: {
            where: {
              role: 'SPECTATOR',
            },
            select: {
              id: true,
            },
          },
        },
        take: 1,
      },
    },
  })

  if (!campaign) {
    return res.status(404).json({
      code: 'INVITE_EXPIRED',
      message: 'Spectator invite code is invalid',
    })
  }

  if (campaign.spectatorPolicy === 'NONE') {
    return res.status(403).json({
      code: 'SPECTATORS_DISABLED',
      message: 'Spectators are not enabled for this campaign',
    })
  }

  if (campaign.spectatorPolicy === 'USERS' && requester.authType !== 'FULL') {
    return res.status(403).json({
      code: 'FULL_ACCOUNT_REQUIRED',
      message: 'This campaign only allows full-account spectators',
    })
  }

  const existingWaitlist = await prisma.spectatorWaitlist.findUnique({
    where: {
      campaignId_userId: {
        campaignId: campaign.id,
        userId: requester.id,
      },
    },
    select: {
      waitlistToken: true,
      promoted: true,
      joinedAt: true,
    },
  })

  const activeSession = campaign.sessions[0] || null
  const spectatorSlotsMax = campaign.spectatorMax ?? 5
  const currentFilled = activeSession?.members.length || 0

  if (!activeSession) {
    return res.status(409).json({
      code: 'SESSION_INACTIVE',
      message: 'No active session is currently available for spectators',
    })
  }

  if (currentFilled >= spectatorSlotsMax) {
    if (!campaign.spectatorWaitlistEnabled) {
      return res.status(409).json({
        code: 'SPECTATOR_CAPACITY_REACHED',
        message: 'Spectator capacity reached and waitlist is disabled',
      })
    }

    const waitlistEntry =
      existingWaitlist ||
      (await prisma.spectatorWaitlist.create({
        data: {
          campaignId: campaign.id,
          userId: requester.id,
          waitlistToken: randomOpaqueToken(),
        },
        select: {
          waitlistToken: true,
          promoted: true,
          joinedAt: true,
        },
      }))

    const position = await prisma.spectatorWaitlist.count({
      where: {
        campaignId: campaign.id,
        promoted: false,
        joinedAt: {
          lte: waitlistEntry.joinedAt,
        },
      },
    })

    return res.status(200).json({
      joined: false,
      waitlist: {
        enabled: true,
        waitlistToken: waitlistEntry.waitlistToken,
        position,
      },
      campaignId: campaign.id,
    })
  }

  await prisma.campaignMembership.upsert({
    where: {
      campaignId_userId: {
        campaignId: campaign.id,
        userId: requester.id,
      },
    },
    create: {
      campaignId: campaign.id,
      userId: requester.id,
      role: 'SPECTATOR',
    },
    update: {
      role: 'SPECTATOR',
    },
  })

  await prisma.sessionMember.upsert({
    where: {
      sessionId_userId: {
        sessionId: activeSession.id,
        userId: requester.id,
      },
    },
    create: {
      sessionId: activeSession.id,
      userId: requester.id,
      role: 'SPECTATOR',
      username: requester.username,
    },
    update: {
      role: 'SPECTATOR',
      username: requester.username,
    },
  })

  if (existingWaitlist && !existingWaitlist.promoted) {
    await prisma.spectatorWaitlist.update({
      where: {
        campaignId_userId: {
          campaignId: campaign.id,
          userId: requester.id,
        },
      },
      data: {
        promoted: true,
        promotedAt: new Date(),
      },
    })
  }

  return res.status(200).json({
    joined: true,
    token: createToken({
      userId: requester.id as UUID,
      username: requester.username,
      role: 'SPECTATOR',
      authType: requester.authType,
    }),
    user: {
      id: requester.id,
      username: requester.username,
      displayName: requester.displayName,
      role: 'SPECTATOR',
      authType: requester.authType,
    },
    campaignId: campaign.id,
  })
})

router.get('/browse', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user

  try {
    const campaigns = await browseSpectatorCampaignsForUser({
      userId: user.userId as UUID,
    })
    return res.status(200).json({ campaigns })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'USER_NOT_FOUND') {
        return res.status(404).json({ code: 'USER_NOT_FOUND', message: 'User not found' })
      }
      if (error.message === 'FULL_ACCOUNT_REQUIRED') {
        return res.status(403).json({
          code: 'FULL_ACCOUNT_REQUIRED',
          message: 'Only full accounts may browse spectator campaigns',
        })
      }
    }

    return res.status(500).json({
      code: 'CAMPAIGN_BROWSE_FAILED',
      message: 'Failed to browse campaigns',
    })
  }
})

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { name, description } = req.body || {}

  if (user.authType && user.authType !== 'FULL') {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only full-account users can create campaigns',
    })
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Campaign name is required', field: 'name' })
  }

  const campaign = await createCampaignForUser({
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : undefined,
    currentDmId: user.userId as UUID,
  })

  if (eventBroadcaster.isReady()) {
    eventBroadcaster.sendToAllAuthenticated({
      id: randomUUID() as UUID,
      type: 'CAMPAIGN:LIST_INVALIDATED',
      version: 1,
      userId: user.userId as UUID,
      userRole: user.role,
      sessionId: null as unknown as UUID,
      roomId: null,
      timestamp: Date.now(),
      payload: {
        campaignId: campaign.id as UUID,
        reason: 'CREATED',
      },
    })
  }

  return res.status(201).json({ campaign })
})

router.get('/:campaignId/settings', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  const membership = await prisma.campaignMembership.findUnique({
    where: {
      campaignId_userId: {
        campaignId: campaignId as UUID,
        userId: user.userId as UUID,
      },
    },
    include: {
      campaign: {
        include: {
          sessions: {
            select: {
              id: true,
              state: true,
              endedAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
  })

  if (!membership) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (membership.campaign.currentDmId !== (user.userId as UUID)) {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only campaign DM can manage campaign settings' })
  }

  return res.status(200).json({
    campaign: {
      latestSessionId: membership.campaign.sessions[0]?.id || null,
      latestSessionState: membership.campaign.sessions[0]?.state || null,
      latestSessionEndedAt: membership.campaign.sessions[0]?.endedAt || null,
      id: membership.campaign.id,
      name: membership.campaign.name,
      description: membership.campaign.description,
      posterUrl: membership.campaign.posterUrl,
      discoverable: membership.campaign.discoverable,
      spectatorPolicy: membership.campaign.spectatorPolicy,
      spectatorMax: membership.campaign.spectatorMax,
      spectatorWaitlistEnabled: membership.campaign.spectatorWaitlistEnabled,
      spectatorReconnectGraceSecs: membership.campaign.spectatorReconnectGraceSecs,
      dmAutoTargetOnFirstPlayerJoin: membership.campaign.dmAutoTargetOnFirstPlayerJoin,
      postSessionChatEnabled: membership.campaign.postSessionChatEnabled,
      postSessionChatDurationMs: membership.campaign.postSessionChatDurationMs,
      extensionSyncPolicy: membership.campaign.extensionSyncPolicy,
      lateJoinPolicy: membership.campaign.lateJoinPolicy,
      lateJoinGraceMinutes: membership.campaign.lateJoinGraceMinutes,
      inviteCode: membership.campaign.inviteCode,
      inviteActive: membership.campaign.inviteActive,
      spectatorInviteCode: membership.campaign.spectatorInviteCode,
      spectatorInviteActive: membership.campaign.spectatorInviteActive,
    },
  })
})

router.patch('/:campaignId/settings', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const {
    name,
    description,
    posterUrl,
    discoverable,
    spectatorsEnabled,
    spectatorMax,
    spectatorWaitlistEnabled,
    spectatorReconnectGraceSecs,
    dmAutoTargetOnFirstPlayerJoin,
    postSessionChatEnabled,
    postSessionChatDurationMs,
    extensionSyncPolicy,
    lateJoinPolicy,
    lateJoinGraceMinutes,
  } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Campaign name is required', field: 'name' })
  }

  if (posterUrl != null && (typeof posterUrl !== 'string' || posterUrl.trim().length > 2_000_000)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'posterUrl must be a string up to 2,000,000 characters or null',
      field: 'posterUrl',
    })
  }

  // Fetch campaign early so optional fields can fall back to existing values
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId as UUID } })
  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID)) {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only campaign DM can manage campaign settings' })
  }

  // Optional boolean fields — fall back to existing campaign values if not provided
  const effectiveDiscoverable =
    typeof discoverable === 'boolean' ? discoverable : (campaign.discoverable ?? false)

  const effectiveSpectatorsEnabled =
    typeof spectatorsEnabled === 'boolean' ? spectatorsEnabled : campaign.spectatorPolicy !== 'NONE'

  const parsedSpectatorMax = Number(spectatorMax ?? campaign.spectatorMax ?? 10)
  if (
    effectiveSpectatorsEnabled &&
    (!Number.isFinite(parsedSpectatorMax) ||
      parsedSpectatorMax < 5 ||
      parsedSpectatorMax > 50 ||
      parsedSpectatorMax % 5 !== 0)
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'spectatorMax must be a number between 5 and 50 in increments of 5',
      field: 'spectatorMax',
    })
  }

  const effectiveSpectatorWaitlistEnabled =
    effectiveSpectatorsEnabled &&
    (typeof spectatorWaitlistEnabled === 'boolean'
      ? spectatorWaitlistEnabled
      : (campaign.spectatorWaitlistEnabled ?? false))

  const parsedReconnectGraceSecs = Number(
    spectatorReconnectGraceSecs ?? campaign.spectatorReconnectGraceSecs ?? 60
  )
  if (
    !Number.isFinite(parsedReconnectGraceSecs) ||
    parsedReconnectGraceSecs < 30 ||
    parsedReconnectGraceSecs > 90 ||
    parsedReconnectGraceSecs % 5 !== 0
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'spectatorReconnectGraceSecs must be a number between 30 and 90 in increments of 5',
      field: 'spectatorReconnectGraceSecs',
    })
  }

  const normalizedExtensionSyncPolicy =
    extensionSyncPolicy === 'ALLOW' || !extensionSyncPolicy ? 'DM_AND_PLAYERS' : extensionSyncPolicy
  if (!['NONE', 'DM_ONLY', 'DM_AND_PLAYERS'].includes(String(normalizedExtensionSyncPolicy))) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'extensionSyncPolicy must be NONE, DM_ONLY, or ALLOW',
      field: 'extensionSyncPolicy',
    })
  }

  const effectiveLateJoinPolicy = lateJoinPolicy ?? campaign.lateJoinPolicy ?? 'OPEN'
  if (!['OPEN', 'SCREENED', 'BLOCKED'].includes(String(effectiveLateJoinPolicy))) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'lateJoinPolicy must be OPEN, SCREENED, or BLOCKED',
      field: 'lateJoinPolicy',
    })
  }

  const parsedGraceMinutes = Number(lateJoinGraceMinutes ?? campaign.lateJoinGraceMinutes ?? 30)
  if (
    !Number.isFinite(parsedGraceMinutes) ||
    parsedGraceMinutes < 30 ||
    parsedGraceMinutes > 90 ||
    parsedGraceMinutes % 10 !== 0
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'lateJoinGraceMinutes must be a number between 30 and 90 in increments of 10',
      field: 'lateJoinGraceMinutes',
    })
  }

  const normalizedPosterUrl =
    typeof posterUrl === 'string' && posterUrl.trim().length > 0 ? posterUrl.trim() : null

  const normalizedPostSessionChatEnabled =
    typeof postSessionChatEnabled === 'boolean'
      ? postSessionChatEnabled
      : typeof postSessionChatEnabled === 'string'
        ? postSessionChatEnabled.toLowerCase() === 'true'
          ? true
          : postSessionChatEnabled.toLowerCase() === 'false'
            ? false
            : null
        : postSessionChatEnabled == null
          ? campaign.postSessionChatEnabled
          : null

  if (normalizedPostSessionChatEnabled == null) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'postSessionChatEnabled must be a boolean',
      field: 'postSessionChatEnabled',
    })
  }

  const rawPostSessionChatDurationMs =
    postSessionChatDurationMs == null
      ? campaign.postSessionChatDurationMs
      : postSessionChatDurationMs
  const parsedPostSessionChatDurationMs = Number(rawPostSessionChatDurationMs)
  if (
    !Number.isFinite(parsedPostSessionChatDurationMs) ||
    parsedPostSessionChatDurationMs < 60_000 ||
    parsedPostSessionChatDurationMs > 900_000 ||
    parsedPostSessionChatDurationMs % 60_000 !== 0
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message:
        'postSessionChatDurationMs must be a number between 60000 and 900000 in 60000ms increments',
      field: 'postSessionChatDurationMs',
    })
  }

  const normalizedDmAutoTargetOnFirstPlayerJoin =
    typeof dmAutoTargetOnFirstPlayerJoin === 'boolean'
      ? dmAutoTargetOnFirstPlayerJoin
      : dmAutoTargetOnFirstPlayerJoin == null
        ? campaign.dmAutoTargetOnFirstPlayerJoin
        : null

  if (normalizedDmAutoTargetOnFirstPlayerJoin == null) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'dmAutoTargetOnFirstPlayerJoin must be a boolean',
      field: 'dmAutoTargetOnFirstPlayerJoin',
    })
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId as UUID },
    data: {
      name: name.trim(),
      description:
        typeof description === 'string' && description.trim().length > 0
          ? description.trim()
          : null,
      posterUrl: normalizedPosterUrl,
      discoverable: effectiveDiscoverable,
      spectatorPolicy: effectiveSpectatorsEnabled ? 'GUESTS' : 'NONE',
      spectatorInviteActive: effectiveSpectatorsEnabled,
      spectatorMax: effectiveSpectatorsEnabled ? Math.round(parsedSpectatorMax) : null,
      spectatorWaitlistEnabled: effectiveSpectatorWaitlistEnabled,
      spectatorReconnectGraceSecs: Math.round(parsedReconnectGraceSecs),
      dmAutoTargetOnFirstPlayerJoin: normalizedDmAutoTargetOnFirstPlayerJoin,
      postSessionChatEnabled: normalizedPostSessionChatEnabled,
      postSessionChatDurationMs: Math.round(parsedPostSessionChatDurationMs),
      extensionSyncPolicy: normalizedExtensionSyncPolicy,
      lateJoinPolicy: effectiveLateJoinPolicy,
      lateJoinGraceMinutes: Math.round(parsedGraceMinutes),
    },
    select: {
      id: true,
      name: true,
      description: true,
      posterUrl: true,
      discoverable: true,
      spectatorPolicy: true,
      spectatorMax: true,
      spectatorWaitlistEnabled: true,
      spectatorReconnectGraceSecs: true,
      dmAutoTargetOnFirstPlayerJoin: true,
      postSessionChatEnabled: true,
      postSessionChatDurationMs: true,
      extensionSyncPolicy: true,
      lateJoinPolicy: true,
      lateJoinGraceMinutes: true,
      inviteCode: true,
      inviteActive: true,
      spectatorInviteCode: true,
      spectatorInviteActive: true,
    },
  })

  return res.status(200).json({ campaign: updated })
})

router.get(
  '/:campaignId/settings/dm-voice-targeting',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as any).user
    const { campaignId } = req.params

    if (!isValidUUID(campaignId)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId as UUID } })
    if (!campaign) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
    }

    if (campaign.currentDmId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only campaign DM can manage campaign settings',
      })
    }

    return res.status(200).json({
      campaignId: campaign.id,
      dmAutoTargetOnFirstPlayerJoin: campaign.dmAutoTargetOnFirstPlayerJoin,
    })
  }
)

router.patch(
  '/:campaignId/settings/dm-voice-targeting',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as any).user
    const { campaignId } = req.params
    const { dmAutoTargetOnFirstPlayerJoin } = req.body || {}

    if (!isValidUUID(campaignId)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid campaignId',
        field: 'campaignId',
      })
    }

    if (typeof dmAutoTargetOnFirstPlayerJoin !== 'boolean') {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'dmAutoTargetOnFirstPlayerJoin must be a boolean',
        field: 'dmAutoTargetOnFirstPlayerJoin',
      })
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId as UUID } })
    if (!campaign) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
    }

    if (campaign.currentDmId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only campaign DM can manage campaign settings',
      })
    }

    const updated = await prisma.campaign.update({
      where: { id: campaignId as UUID },
      data: { dmAutoTargetOnFirstPlayerJoin },
      select: {
        id: true,
        dmAutoTargetOnFirstPlayerJoin: true,
      },
    })

    return res.status(200).json({
      campaignId: updated.id,
      dmAutoTargetOnFirstPlayerJoin: updated.dmAutoTargetOnFirstPlayerJoin,
    })
  }
)

router.post('/:campaignId/invites/reissue', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const inviteType = String(req.body?.type || '').toUpperCase()

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!['PLAYER', 'SPECTATOR'].includes(inviteType)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'type must be PLAYER or SPECTATOR',
      field: 'type',
    })
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId as UUID } })
  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID)) {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only campaign DM can reissue invites' })
  }

  if (inviteType === 'PLAYER') {
    const updated = await prisma.campaign.update({
      where: { id: campaignId as UUID },
      data: {
        inviteCode: generateInviteCode(),
        inviteActive: true,
      },
      select: {
        id: true,
        inviteCode: true,
        inviteActive: true,
      },
    })

    return res.status(200).json({
      invite: {
        type: 'PLAYER',
        code: updated.inviteCode,
        active: updated.inviteActive,
      },
    })
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId as UUID },
    data: {
      spectatorInviteCode: generateInviteCode(),
      spectatorInviteActive: true,
    },
    select: {
      id: true,
      spectatorInviteCode: true,
      spectatorInviteActive: true,
    },
  })

  return res.status(200).json({
    invite: {
      type: 'SPECTATOR',
      code: updated.spectatorInviteCode,
      active: updated.spectatorInviteActive,
    },
  })
})

router.post('/:campaignId/dm/handoff', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const targetUserId = String(req.body?.targetUserId || '').trim()

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!isValidUUID(targetUserId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid targetUserId',
      field: 'targetUserId',
    })
  }

  if ((user.userId as UUID) === (targetUserId as UUID)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'targetUserId must be a different user',
      field: 'targetUserId',
    })
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId as UUID },
    include: {
      members: {
        select: {
          userId: true,
          role: true,
        },
      },
    },
  })

  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID)) {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'Only the current campaign DM can transfer ownership',
    })
  }

  const targetMembership = campaign.members.find((member) => member.userId === targetUserId)
  if (!targetMembership || targetMembership.role !== 'PLAYER') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'targetUserId must belong to an existing player in this campaign',
      field: 'targetUserId',
    })
  }

  await prisma.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: campaignId as UUID },
      data: {
        currentDmId: targetUserId as UUID,
      },
    })

    await tx.campaignMembership.update({
      where: {
        campaignId_userId: {
          campaignId: campaignId as UUID,
          userId: user.userId as UUID,
        },
      },
      data: {
        role: 'PLAYER',
      },
    })

    await tx.campaignMembership.update({
      where: {
        campaignId_userId: {
          campaignId: campaignId as UUID,
          userId: targetUserId as UUID,
        },
      },
      data: {
        role: 'DM',
      },
    })

    await tx.user.updateMany({
      where: {
        id: targetUserId as UUID,
      },
      data: {
        role: 'DM',
      },
    })

    await tx.user.updateMany({
      where: {
        id: targetUserId as UUID,
        adminRole: null,
      },
      data: {
        adminRole: 'CAMPAIGN_DM',
      },
    })
  })

  return res.status(200).json({
    campaign: {
      id: campaignId,
      previousDmId: user.userId as UUID,
      currentDmId: targetUserId as UUID,
      transferredAt: new Date().toISOString(),
    },
  })
})

router.get('/:campaignId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  const campaign = await getCampaignForUser({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
  })

  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  return res.status(200).json({ campaign })
})

router.post('/:campaignId/join', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const { inviteCode } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!inviteCode || typeof inviteCode !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invite code is required',
      field: 'inviteCode',
    })
  }

  const joined = await joinCampaignForUser({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
    inviteCode: inviteCode.trim().toUpperCase(),
    role: deriveCampaignJoinRole(user.role),
  })

  if (!joined) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Invalid invite code' })
  }

  return res.status(200).json({ ok: true })
})

router.post('/:campaignId/characters', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const {
    name,
    status,
    race,
    class: characterClass,
    subclass,
    avatarUrl,
    metadata,
    isActive,
  } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Character name is required', field: 'name' })
  }

  if (
    status !== undefined &&
    !['ALIVE', 'DEAD', 'LEFT', 'UNKNOWN'].includes(String(status).toUpperCase())
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid character status',
      field: 'status',
    })
  }

  const member = await isUserInCampaign({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
  })
  if (!member) {
    return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
  }

  const character = await createCharacterForCampaign({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
    name: name.trim(),
    status:
      typeof status === 'string'
        ? (status.trim().toUpperCase() as 'ALIVE' | 'DEAD' | 'LEFT' | 'UNKNOWN')
        : undefined,
    race: typeof race === 'string' ? race.trim() : undefined,
    class: typeof characterClass === 'string' ? characterClass.trim() : undefined,
    subclass: typeof subclass === 'string' ? subclass.trim() : undefined,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl.trim() : undefined,
    metadata: metadata && typeof metadata === 'object' ? metadata : undefined,
    isActive: Boolean(isActive),
  })

  return res.status(201).json({ character })
})

router.patch(
  '/:campaignId/characters/:characterId',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as any).user
    const { campaignId, characterId } = req.params
    const {
      name,
      race,
      class: characterClass,
      subclass,
      avatarUrl,
      metadata,
      isActive,
    } = req.body || {}

    if (!isValidUUID(campaignId)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid campaignId',
        field: 'campaignId',
      })
    }

    if (!isValidUUID(characterId)) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid characterId',
        field: 'characterId',
      })
    }

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Character name must be a non-empty string',
        field: 'name',
      })
    }

    if (metadata !== undefined && metadata !== null && typeof metadata !== 'object') {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'metadata must be an object or null',
        field: 'metadata',
      })
    }

    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return res.status(400).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'isActive must be a boolean',
        field: 'isActive',
      })
    }

    const member = await isUserInCampaign({
      campaignId: campaignId as UUID,
      userId: user.userId as UUID,
    })

    if (!member) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
    }

    const character = await updateCharacterForCampaignMember({
      campaignId: campaignId as UUID,
      userId: user.userId as UUID,
      characterId: characterId as UUID,
      name: typeof name === 'string' ? name.trim() : undefined,
      race: race === null ? null : typeof race === 'string' ? race.trim() || null : undefined,
      class:
        characterClass === null
          ? null
          : typeof characterClass === 'string'
            ? characterClass.trim() || null
            : undefined,
      subclass:
        subclass === null
          ? null
          : typeof subclass === 'string'
            ? subclass.trim() || null
            : undefined,
      avatarUrl:
        avatarUrl === null
          ? null
          : typeof avatarUrl === 'string'
            ? avatarUrl.trim() || null
            : undefined,
      metadata: metadata === undefined ? undefined : (metadata as Record<string, unknown> | null),
      isActive: typeof isActive === 'boolean' ? isActive : undefined,
    })

    if (!character) {
      return res
        .status(404)
        .json({ code: ErrorCode.NOT_FOUND, message: 'Character not found for this user' })
    }

    const wsManager = req.app.locals.wsManager as
      | { broadcastEventToSession: (sessionId: UUID, event: any) => void }
      | undefined

    if (wsManager) {
      const sessions = await listSessionsByCampaign(campaignId as UUID)
      const updatedAt = Date.now()
      const characterStats =
        character.metadata &&
        typeof character.metadata === 'object' &&
        !Array.isArray(character.metadata)
          ? (character.metadata as Record<string, unknown>)
          : null

      for (const session of sessions) {
        const presence = await getSessionPresence(session.id as UUID)
        if (!presence.some((entry) => entry.userId === (user.userId as UUID))) {
          continue
        }

        wsManager.broadcastEventToSession(session.id as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'PRESENCE:PROFILE_UPDATED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: session.id as UUID,
          roomId: null,
          timestamp: updatedAt,
          payload: {
            userId: user.userId as UUID,
            username: user.username,
            updatedAt,
            characterName: character.name,
            characterClass: character.class,
            characterSubclass: character.subclass,
            characterRace: character.race,
            level: typeof characterStats?.level === 'number' ? characterStats.level : null,
            characterStats,
            avatarUrl: character.avatarUrl,
          },
        })
      }
    }

    return res.status(200).json({ character })
  }
)

router.post('/:campaignId/sessions/start', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const { name, description } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!isValidSessionName(name)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid session name', field: 'name' })
  }

  const campaign = await getCampaignForUser({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
  })
  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID)) {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only DM can start sessions' })
  }

  if (
    campaign.latestSessionState === 'COOLDOWN' &&
    campaign.postSessionChatEnabled &&
    campaign.latestSessionEndedAt
  ) {
    const elapsedMs = Date.now() - campaign.latestSessionEndedAt.getTime()
    if (elapsedMs < campaign.postSessionChatDurationMs) {
      return res.status(409).json({
        code: ErrorCode.INVALID_STATE_TRANSITION,
        message:
          'The post-session window is still active. Wait for ENDED to clear or disable post-session chat in campaign settings.',
      })
    }
  }

  const session = await createSession(
    name,
    user.userId as UUID,
    typeof description === 'string' ? description : undefined,
    campaignId as UUID
  )

  await ensureSessionDefaultRoomsForSession(session.id as UUID, session.dmId as UUID)
  await restoreRememberedDevMockPlayersForSession(session.id as UUID)

  return res.status(201).json({ session })
})

router.get('/:campaignId/sessions', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  const campaign = await getCampaignForUser({
    campaignId: campaignId as UUID,
    userId: user.userId as UUID,
  })
  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  const sessions = await listSessionsByCampaign(campaignId as UUID)
  let effectiveSessions = sessions

  if (
    effectiveSessions.length > 0 &&
    effectiveSessions.every((session) => session.state === 'CLEANUP') &&
    (campaign.memberRole === 'DM' || campaign.memberRole === 'PLAYER')
  ) {
    const dateLabel = new Date().toLocaleDateString('en-CA')
    const sessionName = `Session ${effectiveSessions.length + 1} - ${dateLabel}`
    const newSession = await createSession(
      sessionName,
      campaign.currentDmId as UUID,
      undefined,
      campaignId as UUID
    )
    await ensureSessionDefaultRoomsForSession(newSession.id as UUID, newSession.dmId as UUID)
    effectiveSessions = await listSessionsByCampaign(campaignId as UUID)
  }

  const cooldownDurationMs = Math.max(
    SESSION_COOLDOWN_EXTENSION_MIN_MS,
    Math.min(SESSION_COOLDOWN_EXTENSION_MAX_MS, campaign.postSessionChatDurationMs)
  )
  const sessionsWithCooldownExtensionCount = await Promise.all(
    effectiveSessions.map(async (session) => {
      const cooldownExpiresAt =
        session.state === 'COOLDOWN' && Number.isFinite(Number(session.endedAt))
          ? Number(session.endedAt) + cooldownDurationMs
          : undefined

      if (session.state !== 'COOLDOWN') {
        return {
          ...session,
          cooldownExpiresAt,
          cooldownExtensionCount: 0,
        }
      }

      const cooldownExtensionCount = await countSessionCooldownExtensions(session.id as UUID)
      return {
        ...session,
        cooldownExpiresAt,
        cooldownExtensionCount,
      }
    })
  )

  return res.status(200).json({ sessions: sessionsWithCooldownExtensionCount })
})

router.get('/:campaignId/spectator/waitlist-status', async (req: Request, res: Response) => {
  const campaignId = String(req.params.campaignId || '').trim()
  const waitlistToken = String(req.query.waitlistToken || '').trim()

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!waitlistToken) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'waitlistToken is required',
      field: 'waitlistToken',
    })
  }

  const status = await getSpectatorWaitlistStatus({
    campaignId,
    waitlistToken,
  })

  return res.status(status.status === 'NOT_FOUND' ? 404 : 200).json(status)
})

router.get('/:campaignId/external-links', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid campaignId',
      field: 'campaignId',
    })
  }

  try {
    const result = await listCampaignExternalLinks({
      campaignId,
      requesterUserId: user.userId,
    })

    if (!result.ok) {
      if (result.code === 'CAMPAIGN_NOT_FOUND') {
        return res.status(404).json({
          code: ErrorCode.NOT_FOUND,
          message: 'Campaign not found',
        })
      }

      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the campaign DM can view external links',
      })
    }

    return res.status(200).json({ links: result.links })
  } catch {
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to retrieve external links',
    })
  }
})

router.post('/:campaignId/external-links', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const { externalSystem, externalId } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid campaignId',
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

  if (!externalId || typeof externalId !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'externalId is required',
      field: 'externalId',
    })
  }

  try {
    const result = await upsertCampaignExternalLink({
      campaignId,
      externalSystem,
      externalId,
      actor: {
        userId: user.userId,
        username: user.username,
        role: user.role,
        adminRole: user.adminRole,
      },
    })

    if (!result.ok) {
      if (result.code === 'CAMPAIGN_NOT_FOUND') {
        return res.status(404).json({
          code: ErrorCode.NOT_FOUND,
          message: 'Campaign not found',
        })
      }

      if (result.code === 'FORBIDDEN') {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: result.message,
        })
      }

      return res.status(409).json({
        code: result.code,
        message: result.message,
      })
    }

    return res.status(result.status === 'created' ? 201 : 200).json({
      message: result.message,
      link: result.link,
    })
  } catch {
    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to create external link',
    })
  }
})

export default router
