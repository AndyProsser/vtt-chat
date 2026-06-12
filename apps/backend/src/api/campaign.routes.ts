import { Router, Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { getPrismaClient } from '@/infra/db'
import {
  buildCampaignSessionName,
  ErrorCode,
  PresenceState,
  Role,
  RoomType,
  SessionState,
  isValidRoomName,
  isValidSessionName,
  isValidUUID,
} from '@shared'
import type { UUID } from '@shared'
import { createToken, extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { createSession } from '@/services/session/core.service'
import {
  createRoom,
  deleteRoom,
  ensureSessionDefaultRoomsForSession,
  getRoom,
  getRoomMemberIds,
  getRooms,
  getSessionPresence,
} from '@/services/room.service'
import { listSessionsByCampaign } from '@/repositories/session.repository'
import {
  listAudioRoomStateBySession,
  removeAudioRoomStateRecord,
  upsertAudioRoomStateRecord,
} from '@/repositories/audio.repository'
import { countSessionCooldownExtensions } from '@/services/session/logs.service'
import { restoreRememberedDevMockPlayersForSession } from '@/services/dev-mock/players.service'
import { isCampaignPersistentRoom, normalizeRoomName } from '@/services/room/shared'
import {
  createCampaignForUser,
  createCharacterForCampaign,
  getCampaignForUser,
  isUserInCampaign,
  joinCampaignForUser,
  listCampaignMembersForPresence,
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
import {
  importCampaignBundle,
  findImportConflict,
} from '@/services/admin/admin-portability.service'
import { buildDmCampaignExport } from '@/services/dm-portability.service'
import { deriveCampaignJoinRole } from '@/services/session/authz.service'
import { broadcastPresenceProfileUpdate } from '@/services/session/presence-profile-broadcast.service'
import {
  SESSION_COOLDOWN_EXTENSION_MAX_MS,
  SESSION_COOLDOWN_EXTENSION_MIN_MS,
} from '@/constants/session.constants'
import { logger } from '@/utils/logger'
import type { WebSocketManager } from '@/ws'
import eventBroadcaster from '@/ws/event-broadcaster'
import type { SupportedPlatform } from '@prisma/client'
import {
  clearPendingDmTransfer,
  consumePendingDmTransfer,
  getPendingDmTransfer,
  storePendingDmTransfer,
} from '@/services/dm-transfer.service'

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

function internalErrorResponse(res: Response) {
  return res.status(500).json({ code: ErrorCode.INTERNAL_ERROR, error: 'Internal server error' })
}

type CampaignGroupDto = {
  id: UUID
  campaignId: UUID
  name: string
  type: 'GROUP'
  defaultEnvironmentName?: string
  createdAt: number
  createdBy: UUID
  updatedAt: number
}

type PartyPresenceStatus = 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'

function isAwayEligibleSessionState(state: SessionState | null | undefined): boolean {
  return (
    state === SessionState.ACTIVE ||
    state === SessionState.PAUSED ||
    state === SessionState.COOLDOWN
  )
}

function derivePartyPresenceStatus(params: {
  hasRuntimeHere: boolean
  hasRuntimeElsewhere: boolean
  hasUnassignedConnection: boolean
  runtimeState?: PresenceState
  latestRuntimeSessionState?: SessionState | null
}): { status: PartyPresenceStatus; manualAway: boolean } {
  const runtimeState = params.runtimeState
  const hasLiveRuntimeHere =
    params.hasRuntimeHere ||
    (runtimeState !== undefined && runtimeState !== null && runtimeState !== PresenceState.OFFLINE)

  const awayByIdle =
    runtimeState === PresenceState.IDLE &&
    isAwayEligibleSessionState(params.latestRuntimeSessionState || null)

  if (hasLiveRuntimeHere) {
    return {
      status: awayByIdle ? 'AWAY' : 'HERE',
      manualAway: awayByIdle,
    }
  }

  if (params.hasRuntimeElsewhere) {
    return { status: 'NOT_HERE', manualAway: false }
  }

  if (params.hasUnassignedConnection) {
    return { status: 'LOBBY', manualAway: false }
  }

  return { status: 'OFFLINE', manualAway: false }
}

function isReservedCampaignGroupName(name: string): boolean {
  const normalized = normalizeRoomName(name)
  return (
    normalized === 'main' ||
    normalized === 'main room' ||
    normalized === 'whisper' ||
    normalized === 'greenroom' ||
    normalized === 'green room' ||
    normalized === 'green-room'
  )
}

function toCampaignGroupDto(params: {
  campaignId: UUID
  room: Awaited<ReturnType<typeof getRoom>> extends infer T ? Exclude<T, null> : never
  environmentName?: string
}): CampaignGroupDto {
  return {
    id: params.room.id,
    campaignId: params.campaignId,
    name: params.room.name,
    type: 'GROUP',
    defaultEnvironmentName: params.environmentName,
    createdAt: params.room.createdAt,
    createdBy: params.room.createdBy,
    updatedAt: params.room.updatedAt,
  }
}

async function getCampaignGroupsReferenceSession(params: {
  campaignId: UUID
  dmUserId: UUID
  createIfMissing?: boolean
}) {
  const sessions = await listSessionsByCampaign(params.campaignId)
  const existingSession = sessions[0]
  if (existingSession) {
    return existingSession
  }

  if (!params.createIfMissing) {
    return null
  }

  const dateLabel = new Date().toLocaleDateString('en-AU')
  const session = await createSession(
    `Session 1 - ${dateLabel}`,
    params.dmUserId,
    undefined,
    params.campaignId
  )

  await ensureSessionDefaultRoomsForSession(session.id as UUID, session.dmId as UUID)

  return session
}

async function listCampaignGroupsForReferenceSession(campaignId: UUID, sessionId: UUID) {
  const [rooms, environmentStates] = await Promise.all([
    getRooms(sessionId),
    listAudioRoomStateBySession(sessionId),
  ])

  const environmentByRoomId = new Map<string, string>()
  for (const state of environmentStates) {
    if (!environmentByRoomId.has(state.roomId)) {
      environmentByRoomId.set(state.roomId, state.environmentName)
    }
  }

  return rooms
    .filter((room) => isCampaignPersistentRoom(room))
    .map((room) =>
      toCampaignGroupDto({
        campaignId,
        room,
        environmentName: environmentByRoomId.get(room.id),
      })
    )
}

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const campaigns = await listCampaignsForUser(user.userId as UUID)
    logger.debug('campaign.routes', 'listCampaignsForUser response', {
      userId: user.userId,
      campaignsCount: Array.isArray(campaigns) ? campaigns.length : 0,
    })
    res.status(200).json({ campaigns })
  } catch (err) {
    logger.error('campaign.routes', 'Failed to list campaigns for user', err)
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to retrieve campaigns' })
  }
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

  await prisma.user.upsert({
    where: { id: user.userId as UUID },
    create: {
      id: user.userId as UUID,
      username: user.username,
      displayName:
        typeof user.displayName === 'string' && user.displayName.trim().length > 0
          ? user.displayName.trim()
          : user.username,
      role: 'DM',
      adminRole: 'CAMPAIGN_DM',
      authType: user.authType ?? 'FULL',
    },
    update: {
      username: user.username,
      displayName:
        typeof user.displayName === 'string' && user.displayName.trim().length > 0
          ? user.displayName.trim()
          : user.username,
      role: 'DM',
      adminRole: 'CAMPAIGN_DM',
      authType: user.authType ?? 'FULL',
    },
  })

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

router.get('/:campaignId/party-presence', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const requestedSessionIdRaw = req.query.sessionId
  const requestedSessionId =
    typeof requestedSessionIdRaw === 'string' && requestedSessionIdRaw.trim().length > 0
      ? requestedSessionIdRaw.trim()
      : null

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (requestedSessionId && !isValidUUID(requestedSessionId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid sessionId', field: 'sessionId' })
  }

  try {
    const allowed = await isUserInCampaign({
      campaignId: campaignId as UUID,
      userId: user.userId as UUID,
    })

    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
    }

    const campaignMembers = await listCampaignMembersForPresence(campaignId as UUID)

    const latestRuntimeSession = requestedSessionId
      ? await prisma.session.findFirst({
          where: {
            id: requestedSessionId as UUID,
            campaignId: campaignId as UUID,
            state: {
              in: [
                SessionState.IDLE,
                SessionState.ACTIVE,
                SessionState.PAUSED,
                SessionState.COOLDOWN,
              ],
            },
          },
          select: {
            id: true,
            state: true,
          },
        })
      : await prisma.session.findFirst({
          where: {
            campaignId: campaignId as UUID,
            state: {
              in: [
                SessionState.IDLE,
                SessionState.ACTIVE,
                SessionState.PAUSED,
                SessionState.COOLDOWN,
              ],
            },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            state: true,
          },
        })

    let runtimePresence: Awaited<ReturnType<typeof getSessionPresence>> = []
    if (latestRuntimeSession) {
      try {
        runtimePresence = await getSessionPresence(latestRuntimeSession.id as UUID)
      } catch (error) {
        logger.warn(
          'campaign.routes',
          'Failed to read runtime presence for party snapshot; falling back to websocket bindings',
          {
            campaignId,
            sessionId: latestRuntimeSession.id,
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }

    const runtimePresenceByUser = new Map(runtimePresence.map((entry) => [entry.userId, entry]))

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    const activeRuntimeByUser = wsManager?.getActiveRuntimeSessionsByUser() || {}
    const unassignedConnectedUsers = new Set<UUID>(
      wsManager?.getUsersWithUnassignedConnections() || []
    )

    const runtimeSessionIds: UUID[] = Array.from(
      new Set(Object.values(activeRuntimeByUser).flatMap((sessionIds: UUID[]) => sessionIds))
    )
    const runtimeSessionRows =
      runtimeSessionIds.length > 0
        ? await prisma.session.findMany({
            where: {
              id: { in: runtimeSessionIds },
            },
            select: {
              id: true,
              campaignId: true,
              state: true,
            },
          })
        : []

    const runtimeSessionCampaignById = new Map(
      runtimeSessionRows.map((row) => [row.id as UUID, row.campaignId as UUID | null] as const)
    )

    const members = campaignMembers.map((member) => {
      const userRuntimeSessionIds = activeRuntimeByUser[member.userId as UUID] || []
      const hasRuntimeHere = latestRuntimeSession
        ? userRuntimeSessionIds.includes(latestRuntimeSession.id as UUID)
        : userRuntimeSessionIds.some(
            (sessionId: UUID) => runtimeSessionCampaignById.get(sessionId) === (campaignId as UUID)
          )
      const hasRuntimeElsewhere = userRuntimeSessionIds.some(
        (sessionId: UUID) => runtimeSessionCampaignById.get(sessionId) !== (campaignId as UUID)
      )

      const runtimeEntry = runtimePresenceByUser.get(member.userId as UUID)
      const runtimeState = runtimeEntry?.state
      const { status, manualAway } = derivePartyPresenceStatus({
        hasRuntimeHere,
        hasRuntimeElsewhere,
        hasUnassignedConnection: unassignedConnectedUsers.has(member.userId as UUID),
        runtimeState,
        latestRuntimeSessionState: (latestRuntimeSession?.state as SessionState | null) || null,
      })

      return {
        userId: member.userId,
        username: member.username,
        role: member.role,
        playerName: member.playerName,
        avatarUrl: member.avatarUrl,
        characterName: member.characterName,
        characterClass: member.characterClass,
        characterRace: member.characterRace,
        level: member.level,
        characterStats: member.characterStats,
        status,
        runtimePresenceState: runtimeState || null,
        lastSeenAt: runtimeEntry?.lastSeenAt || null,
        currentRuntimeSessionId: hasRuntimeHere ? latestRuntimeSession?.id || null : null,
        manualAway,
      }
    })

    return res.status(200).json({
      campaignId,
      sessionId: latestRuntimeSession?.id || null,
      members,
      snapshotAt: Date.now(),
    })
  } catch (error) {
    logger.error('campaign.routes', 'Failed to build campaign party presence snapshot', error)
    return internalErrorResponse(res)
  }
})

router.get('/:campaignId/groups', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  try {
    const allowed = await isUserInCampaign({
      campaignId: campaignId as UUID,
      userId: user.userId as UUID,
    })

    if (!allowed) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
    }

    const referenceSession = await getCampaignGroupsReferenceSession({
      campaignId: campaignId as UUID,
      dmUserId: user.userId as UUID,
      createIfMissing: false,
    })

    if (!referenceSession) {
      return res.status(200).json({
        campaignId,
        referenceSessionId: null,
        groups: [],
      })
    }

    const groups = await listCampaignGroupsForReferenceSession(
      campaignId as UUID,
      referenceSession.id as UUID
    )

    return res.status(200).json({
      campaignId,
      referenceSessionId: referenceSession.id,
      groups,
    })
  } catch (error) {
    logger.error('campaign.routes', 'Failed to list campaign groups', error)
    return internalErrorResponse(res)
  }
})

router.post('/:campaignId/groups', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params
  const { name, defaultEnvironmentName } = req.body || {}

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  if (!isValidRoomName(name) || isReservedCampaignGroupName(String(name || ''))) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid or reserved group name',
      field: 'name',
    })
  }

  try {
    const campaign = await getCampaignForUser({
      campaignId: campaignId as UUID,
      userId: user.userId as UUID,
    })

    if (!campaign) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
    }

    if (campaign.currentDmId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only campaign DM can manage campaign groups',
      })
    }

    const referenceSession = await getCampaignGroupsReferenceSession({
      campaignId: campaignId as UUID,
      dmUserId: user.userId as UUID,
      createIfMissing: true,
    })

    if (!referenceSession) {
      return internalErrorResponse(res)
    }

    const existingRooms = await getRooms(referenceSession.id as UUID)
    const duplicate = existingRooms.some(
      (room) =>
        isCampaignPersistentRoom(room) &&
        normalizeRoomName(room.name) === normalizeRoomName(String(name))
    )

    if (duplicate) {
      return res.status(409).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'A group with that name already exists',
        field: 'name',
      })
    }

    const room = await createRoom({
      sessionId: referenceSession.id as UUID,
      name: String(name).trim(),
      type: RoomType.GROUP,
      createdBy: user.userId as UUID,
    })

    const normalizedEnvironment =
      typeof defaultEnvironmentName === 'string' &&
      defaultEnvironmentName.trim().length > 0 &&
      defaultEnvironmentName !== 'Default'
        ? defaultEnvironmentName.trim()
        : undefined

    if (normalizedEnvironment) {
      await upsertAudioRoomStateRecord({
        sessionId: referenceSession.id,
        roomId: room.id,
        environmentName: normalizedEnvironment,
        environmentId: `env-${normalizedEnvironment}`,
        parameters: {},
        setBy: user.userId as UUID,
        setAt: new Date(),
      })
    }

    return res.status(201).json({
      group: toCampaignGroupDto({
        campaignId: campaignId as UUID,
        room,
        environmentName: normalizedEnvironment,
      }),
    })
  } catch (error) {
    logger.error('campaign.routes', 'Failed to create campaign group', error)
    return internalErrorResponse(res)
  }
})

router.patch('/:campaignId/groups/:groupId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId, groupId } = req.params
  const { defaultEnvironmentName } = req.body || {}

  if (!isValidUUID(campaignId) || !isValidUUID(groupId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid campaignId or groupId',
    })
  }

  try {
    const campaign = await getCampaignForUser({
      campaignId: campaignId as UUID,
      userId: user.userId as UUID,
    })

    if (!campaign) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
    }

    if (campaign.currentDmId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only campaign DM can manage campaign groups',
      })
    }

    const room = await getRoom(groupId as UUID)
    if (!room || !isCampaignPersistentRoom(room)) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Group not found' })
    }

    const referenceSession = await getCampaignGroupsReferenceSession({
      campaignId: campaignId as UUID,
      dmUserId: user.userId as UUID,
      createIfMissing: false,
    })

    if (!referenceSession || room.sessionId !== (referenceSession.id as UUID)) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Group not found' })
    }

    const normalizedEnvironment =
      typeof defaultEnvironmentName === 'string' &&
      defaultEnvironmentName.trim().length > 0 &&
      defaultEnvironmentName !== 'Default'
        ? defaultEnvironmentName.trim()
        : undefined

    if (normalizedEnvironment) {
      await upsertAudioRoomStateRecord({
        sessionId: room.sessionId,
        roomId: room.id,
        environmentName: normalizedEnvironment,
        environmentId: `env-${normalizedEnvironment}`,
        parameters: {},
        setBy: user.userId as UUID,
        setAt: new Date(),
      })
    } else {
      await removeAudioRoomStateRecord({ sessionId: room.sessionId, roomId: room.id })
    }

    return res.status(200).json({
      group: toCampaignGroupDto({
        campaignId: campaignId as UUID,
        room,
        environmentName: normalizedEnvironment,
      }),
    })
  } catch (error) {
    logger.error('campaign.routes', 'Failed to update campaign group environment', error)
    return internalErrorResponse(res)
  }
})

router.delete('/:campaignId/groups/:groupId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId, groupId } = req.params

  if (!isValidUUID(campaignId) || !isValidUUID(groupId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid campaignId or groupId',
    })
  }

  try {
    const campaign = await getCampaignForUser({
      campaignId: campaignId as UUID,
      userId: user.userId as UUID,
    })

    if (!campaign) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
    }

    if (campaign.currentDmId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only campaign DM can manage campaign groups',
      })
    }

    const room = await getRoom(groupId as UUID)
    if (!room || !isCampaignPersistentRoom(room)) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Group not found' })
    }

    const referenceSession = await getCampaignGroupsReferenceSession({
      campaignId: campaignId as UUID,
      dmUserId: user.userId as UUID,
      createIfMissing: false,
    })

    if (!referenceSession || room.sessionId !== (referenceSession.id as UUID)) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Group not found' })
    }

    const memberIds = await getRoomMemberIds(room.sessionId, room.id)
    if (memberIds.length > 0) {
      return res.status(409).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'Group must be empty before deletion',
      })
    }

    await removeAudioRoomStateRecord({ sessionId: room.sessionId, roomId: room.id })
    await deleteRoom({ sessionId: room.sessionId, roomId: room.id })

    return res.status(200).json({ ok: true, deletedGroupId: room.id })
  } catch (error) {
    logger.error('campaign.routes', 'Failed to delete campaign group', error)
    return internalErrorResponse(res)
  }
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
      defaultSessionDurationMins: (membership.campaign as any).defaultSessionDurationMins ?? 240,
      supportedPlatforms: (membership.campaign as any).supportedPlatforms ?? ['ANY'],
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
    defaultSessionDurationMins,
    supportedPlatforms,
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

  // Validate defaultSessionDurationMins (60-720, step 15)
  const parsedDefaultSessionDurationMins = Number(
    defaultSessionDurationMins ?? (campaign as any).defaultSessionDurationMins ?? 240
  )
  if (
    !Number.isFinite(parsedDefaultSessionDurationMins) ||
    parsedDefaultSessionDurationMins < 60 ||
    parsedDefaultSessionDurationMins > 720 ||
    parsedDefaultSessionDurationMins % 15 !== 0
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'defaultSessionDurationMins must be a number between 60 and 720 in increments of 15',
      field: 'defaultSessionDurationMins',
    })
  }

  // Validate supportedPlatforms
  const VALID_PLATFORMS: readonly SupportedPlatform[] = ['ANY', 'DDB', 'ROLL20', 'FOUNDRY']
  const isSupportedPlatform = (value: unknown): value is SupportedPlatform =>
    VALID_PLATFORMS.includes(value as SupportedPlatform)
  const rawSupportedPlatforms: unknown[] | undefined = Array.isArray(supportedPlatforms)
    ? supportedPlatforms
    : supportedPlatforms == null
      ? undefined
      : (null as never)
  const effectiveSupportedPlatformsRaw: unknown[] = rawSupportedPlatforms ??
    ((campaign as any).supportedPlatforms as unknown[] | undefined) ?? ['ANY']
  if (
    !Array.isArray(effectiveSupportedPlatformsRaw) ||
    effectiveSupportedPlatformsRaw.length === 0 ||
    !effectiveSupportedPlatformsRaw.every((platform) => isSupportedPlatform(platform))
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: `supportedPlatforms must be a non-empty array of: ${VALID_PLATFORMS.join(', ')}`,
      field: 'supportedPlatforms',
    })
  }
  const effectiveSupportedPlatforms = effectiveSupportedPlatformsRaw as SupportedPlatform[]

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

  // If a session is currently ACTIVE or PAUSED, reject changes to locked settings groups.
  // This check runs after all values are normalised so we can compare current vs incoming.
  const activeSession = await prisma.session.findFirst({
    where: { campaignId: campaignId as UUID, state: { in: ['ACTIVE', 'PAUSED'] } },
    select: { id: true, state: true },
  })
  if (activeSession) {
    const changedLockedFields: string[] = []
    if (effectiveSpectatorsEnabled !== (campaign.spectatorPolicy !== 'NONE'))
      changedLockedFields.push('spectatorsEnabled')
    if (parsedSpectatorMax !== (campaign.spectatorMax ?? 10))
      changedLockedFields.push('spectatorMax')
    if (
      typeof spectatorWaitlistEnabled === 'boolean' &&
      spectatorWaitlistEnabled !== campaign.spectatorWaitlistEnabled
    )
      changedLockedFields.push('spectatorWaitlistEnabled')
    if (parsedReconnectGraceSecs !== campaign.spectatorReconnectGraceSecs)
      changedLockedFields.push('spectatorReconnectGraceSecs')
    if (normalizedPostSessionChatEnabled !== campaign.postSessionChatEnabled)
      changedLockedFields.push('postSessionChatEnabled')
    if (parsedPostSessionChatDurationMs !== campaign.postSessionChatDurationMs)
      changedLockedFields.push('postSessionChatDurationMs')
    if (normalizedExtensionSyncPolicy !== campaign.extensionSyncPolicy)
      changedLockedFields.push('extensionSyncPolicy')
    if (
      JSON.stringify(effectiveSupportedPlatforms.slice().sort()) !==
      JSON.stringify(((campaign as any).supportedPlatforms ?? ['ANY']).slice().sort())
    )
      changedLockedFields.push('supportedPlatforms')
    if (effectiveLateJoinPolicy !== campaign.lateJoinPolicy)
      changedLockedFields.push('lateJoinPolicy')
    if (parsedGraceMinutes !== campaign.lateJoinGraceMinutes)
      changedLockedFields.push('lateJoinGraceMinutes')
    if (parsedDefaultSessionDurationMins !== ((campaign as any).defaultSessionDurationMins ?? 240))
      changedLockedFields.push('defaultSessionDurationMins')

    if (changedLockedFields.length > 0) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: `These settings cannot be changed while a session is ${activeSession.state}: ${changedLockedFields.join(', ')}`,
        fields: changedLockedFields,
      })
    }
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
      defaultSessionDurationMins: Math.round(parsedDefaultSessionDurationMins),
      supportedPlatforms: effectiveSupportedPlatforms,
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
      defaultSessionDurationMins: true,
      supportedPlatforms: true,
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

/**
 * POST /:campaignId/dm/handoff
 * Phase 1 — DM initiates a campaign ownership transfer to a target player.
 * Stores a pending offer in Redis and notifies the target via WS.
 * The transfer does not execute until the target accepts via /dm/handoff/accept.
 * Only permitted when the latest session is IDLE or there is no session yet.
 */
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
        include: {
          user: { select: { id: true, username: true } },
        },
      },
      sessions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { state: true },
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

  const latestSessionState = campaign.sessions[0]?.state ?? null
  const blockedStates: string[] = [SessionState.ACTIVE, SessionState.PAUSED, SessionState.COOLDOWN]
  if (latestSessionState && blockedStates.includes(latestSessionState)) {
    return res.status(409).json({
      code: ErrorCode.CONFLICT,
      message: `DM transfer is not permitted while the session is ${latestSessionState}. End or wait for the session to reach IDLE first.`,
    })
  }

  const targetMembership = campaign.members.find((m) => m.userId === targetUserId)
  if (!targetMembership || targetMembership.role !== 'PLAYER') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'targetUserId must be an existing PLAYER in this campaign',
      field: 'targetUserId',
    })
  }

  const now = Date.now()
  const TTL_MS = 60 * 60 * 24 * 1000 // 24 hours
  await storePendingDmTransfer({
    campaignId,
    campaignName: campaign.name,
    fromUserId: user.userId,
    fromUsername: user.username,
    toUserId: targetUserId,
    toUsername: targetMembership.user.username,
    initiatedAt: now,
    expiresAt: now + TTL_MS,
  })

  eventBroadcaster.sendToUser(targetUserId as UUID, {
    type: 'CAMPAIGN:DM_TRANSFER_INITIATED',
    sessionId: null as any,
    payload: {
      campaignId,
      campaignName: campaign.name,
      fromUserId: user.userId,
      fromUsername: user.username,
      toUserId: targetUserId,
      toUsername: targetMembership.user.username,
      initiatedAt: now,
      expiresAt: now + TTL_MS,
    },
  })

  logger.info('campaign.routes', 'DM transfer initiated', {
    campaignId,
    fromUserId: user.userId,
    toUserId: targetUserId,
  })

  return res.status(200).json({ pending: true, expiresAt: new Date(now + TTL_MS).toISOString() })
})

/**
 * GET /:campaignId/dm/handoff/pending
 * Returns the current pending DM transfer for the campaign, or null.
 * Accessible to both the current DM and the target player.
 */
router.get(
  '/:campaignId/dm/handoff/pending',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as any).user
    const { campaignId } = req.params

    if (!isValidUUID(campaignId)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
    }

    const membership = await prisma.campaignMembership.findUnique({
      where: { campaignId_userId: { campaignId: campaignId as UUID, userId: user.userId as UUID } },
    })
    if (!membership) {
      return res.status(403).json({ code: ErrorCode.FORBIDDEN, message: 'Not a campaign member' })
    }

    const pending = await getPendingDmTransfer(campaignId)
    return res.status(200).json({ pending })
  }
)

/**
 * POST /:campaignId/dm/handoff/accept
 * Phase 2 — target player accepts the pending ownership offer.
 * Executes the ownership transfer atomically and broadcasts the result.
 */
router.post(
  '/:campaignId/dm/handoff/accept',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as any).user
    const { campaignId } = req.params

    if (!isValidUUID(campaignId)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
    }

    const pending = await getPendingDmTransfer(campaignId)
    if (!pending) {
      return res
        .status(404)
        .json({ code: ErrorCode.NOT_FOUND, message: 'No pending DM transfer for this campaign' })
    }

    if (pending.toUserId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not the target of this DM transfer',
      })
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId as UUID },
      select: { id: true, name: true, currentDmId: true },
    })

    if (!campaign) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
    }

    if (campaign.currentDmId !== (pending.fromUserId as UUID)) {
      // The DM changed between initiate and accept — stale offer.
      await clearPendingDmTransfer(campaignId)
      return res.status(409).json({
        code: ErrorCode.CONFLICT,
        message: 'The pending transfer is no longer valid — the campaign DM has changed.',
      })
    }

    const now = Date.now()

    await prisma.$transaction(async (tx) => {
      await tx.campaign.update({
        where: { id: campaignId as UUID },
        data: { currentDmId: user.userId as UUID },
      })

      // Demote old DM's campaign membership role.
      await tx.campaignMembership.update({
        where: {
          campaignId_userId: {
            campaignId: campaignId as UUID,
            userId: pending.fromUserId as UUID,
          },
        },
        data: { role: 'PLAYER' },
      })

      // Promote new DM's campaign membership role.
      await tx.campaignMembership.update({
        where: {
          campaignId_userId: {
            campaignId: campaignId as UUID,
            userId: user.userId as UUID,
          },
        },
        data: { role: 'DM' },
      })

      // Promote new DM's global role if needed.
      await tx.user.update({
        where: { id: user.userId as UUID },
        data: { role: 'DM', adminRole: 'CAMPAIGN_DM' },
      })

      // Demote old DM's global role only if they are no longer DM of any other campaign.
      const remainingDmCampaigns = await tx.campaign.count({
        where: {
          currentDmId: pending.fromUserId as UUID,
          id: { not: campaignId as UUID },
          deletedAt: null,
          retiredAt: null,
        },
      })
      if (remainingDmCampaigns === 0) {
        await tx.user.updateMany({
          where: {
            id: pending.fromUserId as UUID,
            adminRole: 'CAMPAIGN_DM',
          },
          data: { role: 'PLAYER', adminRole: null },
        })
      }
    })

    await consumePendingDmTransfer(campaignId)

    const transferredPayload = {
      campaignId,
      campaignName: campaign.name,
      previousDmId: pending.fromUserId,
      previousDmUsername: pending.fromUsername,
      newDmId: user.userId,
      newDmUsername: user.username,
      transferredAt: now,
    }

    // Notify all campaign members.
    await eventBroadcaster.broadcastToCampaignMembers(campaignId as UUID, {
      type: 'CAMPAIGN:DM_TRANSFERRED',
      sessionId: null as any,
      payload: transferredPayload,
    })

    // Notify the old DM of the accepted response.
    eventBroadcaster.sendToUser(pending.fromUserId as UUID, {
      type: 'CAMPAIGN:DM_TRANSFER_RESPONDED',
      sessionId: null as any,
      payload: {
        campaignId,
        toUserId: user.userId,
        toUsername: user.username,
        response: 'ACCEPTED',
        respondedAt: now,
      },
    })

    logger.info('campaign.routes', 'DM transfer accepted', {
      campaignId,
      previousDmId: pending.fromUserId,
      newDmId: user.userId,
    })

    return res.status(200).json({
      campaignId,
      previousDmId: pending.fromUserId,
      newDmId: user.userId,
      transferredAt: new Date(now).toISOString(),
    })
  }
)

/**
 * POST /:campaignId/dm/handoff/decline
 * Target player declines a pending ownership offer.
 * Clears the pending state and notifies the DM.
 */
router.post(
  '/:campaignId/dm/handoff/decline',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as any).user
    const { campaignId } = req.params

    if (!isValidUUID(campaignId)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
    }

    const pending = await getPendingDmTransfer(campaignId)
    if (!pending) {
      return res
        .status(404)
        .json({ code: ErrorCode.NOT_FOUND, message: 'No pending DM transfer for this campaign' })
    }

    if (pending.toUserId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'You are not the target of this DM transfer',
      })
    }

    await clearPendingDmTransfer(campaignId)

    eventBroadcaster.sendToUser(pending.fromUserId as UUID, {
      type: 'CAMPAIGN:DM_TRANSFER_RESPONDED',
      sessionId: null as any,
      payload: {
        campaignId,
        toUserId: user.userId,
        toUsername: user.username,
        response: 'DECLINED',
        respondedAt: Date.now(),
      },
    })

    logger.info('campaign.routes', 'DM transfer declined', {
      campaignId,
      fromUserId: pending.fromUserId,
      toUserId: user.userId,
    })

    return res.status(200).json({ declined: true })
  }
)

/**
 * POST /:campaignId/dm/handoff/cancel
 * Current DM cancels their pending outgoing offer.
 * Clears the pending state and notifies the target player.
 */
router.post(
  '/:campaignId/dm/handoff/cancel',
  requireAuth,
  async (req: Request, res: Response) => {
    const user = (req as any).user
    const { campaignId } = req.params

    if (!isValidUUID(campaignId)) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId' })
    }

    const pending = await getPendingDmTransfer(campaignId)
    if (!pending) {
      return res
        .status(404)
        .json({ code: ErrorCode.NOT_FOUND, message: 'No pending DM transfer to cancel' })
    }

    if (pending.fromUserId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the DM who initiated the transfer can cancel it',
      })
    }

    await clearPendingDmTransfer(campaignId)

    eventBroadcaster.sendToUser(pending.toUserId as UUID, {
      type: 'CAMPAIGN:DM_TRANSFER_CANCELLED',
      sessionId: null as any,
      payload: {
        campaignId,
        fromUserId: user.userId,
        fromUsername: user.username,
        cancelledAt: Date.now(),
      },
    })

    logger.info('campaign.routes', 'DM transfer cancelled', {
      campaignId,
      fromUserId: user.userId,
      toUserId: pending.toUserId,
    })

    return res.status(200).json({ cancelled: true })
  }
)

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

  const wsManager = req.app.locals.wsManager as WebSocketManager | undefined
  if (wsManager && character.isActive) {
    const sessions = await listSessionsByCampaign(campaignId as UUID)
    await broadcastPresenceProfileUpdate({
      wsManager,
      sessionIds: sessions.map((session) => session.id as UUID),
      userId: user.userId as UUID,
      username: user.username,
      userRole: user.role as Role,
      updatedAt: character.updatedAt.getTime(),
    })
  }

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

    const wsManager = req.app.locals.wsManager as WebSocketManager | undefined

    if (wsManager && character.isActive) {
      const sessions = await listSessionsByCampaign(campaignId as UUID)
      await broadcastPresenceProfileUpdate({
        wsManager,
        sessionIds: sessions.map((session) => session.id as UUID),
        userId: user.userId as UUID,
        username: user.username,
        userRole: user.role as Role,
        updatedAt: character.updatedAt.getTime(),
      })
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

  const hasLiveSession = effectiveSessions.some((session) =>
    ['IDLE', 'ACTIVE', 'PAUSED', 'COOLDOWN'].includes(session.state)
  )
  if (
    effectiveSessions.length > 0 &&
    !hasLiveSession &&
    (campaign.memberRole === 'DM' || campaign.memberRole === 'PLAYER')
  ) {
    const sessionName = buildCampaignSessionName({
      baseName: campaign.name,
      sessionNumber: effectiveSessions.length + 1,
    })
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

// ─── Campaign Export ──────────────────────────────────────────────────────────

router.get('/:campaignId/export', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { campaignId } = req.params

  if (!isValidUUID(campaignId)) {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid campaignId', field: 'campaignId' })
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId as UUID },
    select: { currentDmId: true },
  })

  if (!campaign) {
    return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
  }

  if (campaign.currentDmId !== (user.userId as UUID)) {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Only the campaign DM can export' })
  }

  try {
    const result = await buildDmCampaignExport(campaignId, user.userId)
    if (!result) {
      return res.status(404).json({ code: ErrorCode.NOT_FOUND, message: 'Campaign not found' })
    }
    return res.json({ bundle: result.bundle, artifactId: result.artifactId, counts: result.counts })
  } catch {
    return res
      .status(500)
      .json({ code: ErrorCode.INTERNAL_ERROR, message: 'Failed to export campaign' })
  }
})

// ─── Campaign Import ──────────────────────────────────────────────────────────

router.post('/import/check', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user

  if (user.authType === 'GUEST') {
    return res.status(200).json({ conflictCampaign: null })
  }

  const { sourceCampaignId } = req.body || {}

  if (!sourceCampaignId || typeof sourceCampaignId !== 'string') {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'sourceCampaignId is required' })
  }

  try {
    const conflictCampaign = await findImportConflict(user.userId, sourceCampaignId)
    return res.status(200).json({ conflictCampaign })
  } catch {
    return res.status(200).json({ conflictCampaign: null })
  }
})

router.post('/import', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user

  if (user.authType === 'GUEST') {
    return res
      .status(403)
      .json({ code: ErrorCode.FORBIDDEN, message: 'Guest accounts cannot import campaigns' })
  }

  const { bundle, nameOverride, conflictCampaignId } = req.body || {}

  if (!bundle || typeof bundle !== 'object') {
    return res
      .status(400)
      .json({ code: ErrorCode.INVALID_INPUT, message: 'bundle is required', field: 'bundle' })
  }

  if (conflictCampaignId) {
    // Verify actor owns the conflict campaign before allowing delete
    const { getPrismaClient } = await import('@/infra/db')
    const prisma = getPrismaClient()
    const owned = await prisma.campaign.findFirst({
      where: { id: conflictCampaignId, currentDmId: user.userId },
      select: { id: true },
    })
    if (!owned) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'You do not own the campaign you are trying to replace',
      })
    }
  }

  try {
    const result = await importCampaignBundle(
      user.userId,
      bundle,
      nameOverride ?? null,
      null,
      conflictCampaignId ?? null
    )
    if (!result) {
      return res
        .status(400)
        .json({ code: ErrorCode.INVALID_INPUT, message: 'Invalid or incompatible export bundle' })
    }

    // Create a fresh IDLE session so the DM can start immediately
    const sessionName = buildCampaignSessionName({
      baseName: result.campaign.name,
      sessionNumber: result.counts.sessions + 1,
    })
    const idleSession = await createSession(
      sessionName,
      user.userId as UUID,
      undefined,
      result.campaign.id as UUID
    )
    await ensureSessionDefaultRoomsForSession(idleSession.id as UUID, user.userId as UUID)

    return res.status(201).json({
      campaign: result.campaign,
      artifactId: result.artifactId,
      counts: result.counts,
    })
  } catch (err) {
    logger.error('campaign.routes', 'Failed to import campaign', err)
    return res
      .status(500)
      .json({ code: ErrorCode.INTERNAL_ERROR, message: 'Failed to import campaign' })
  }
})

export default router
