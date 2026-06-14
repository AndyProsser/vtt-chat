/**
 * Session Routes (formerly Campaign Routes)
 * CRUD operations for game sessions.
 * Uses persistent storage for session state.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { getPrismaClient } from '@/infra/db'
import {
  createSession,
  endSessionCooldown,
  extendSessionCooldown,
  getSession,
  getAllSessions,
  updateSessionMetadata,
  updateSessionState,
  deleteSession,
  addUserToSession,
  removeUserFromSession,
  getSessionUsers,
} from '@/services/session/core.service'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import {
  isValidSessionName,
  isValidUUID,
  normalizeSessionState,
  toPublicSessionState,
  SessionState as SessionStateEnum,
} from '@shared'
import { ErrorCode, PresenceState, Role, RoomType } from '@shared'
import type { UUID } from '@shared'
import {
  emitSessionBoundarySystemMessage,
  emitSessionRecapMessage,
  emitSessionSummaryMessage,
} from '@/services/system-messages.service'
import { disableMockSimulationForSessionExit } from '@/services/dev-mock/simulation.service'
import {
  applySessionStateRoomTransition,
  deletePrivateRoomsForEndedSession,
  ensureSessionDefaultRoomsForSession,
  ensureSessionWhisperRoomForSession,
  getRooms,
  getSessionPresence,
  joinRoom,
  removePresenceProjection,
} from '@/services/room.service'
import {
  clearRoomEnvironmentState,
  clearSessionDMOverrideState,
  getSessionAudioState,
} from '@/services/audio/audio-state'
import { clearRoomMessages, openMainRoomMessageHistory } from '@/services/chat.service'
import {
  countSessionCooldownExtensions,
  logSessionCooldownExtended,
  logSessionJoin,
  logSessionLeave,
  logSessionStateChange,
} from '@/services/session/logs.service'
import { sessionCleanupJobService } from '@/services/session/cleanup-job.service'
import {
  listSessionLogsForRequester,
  listSessionUsersForRequester,
} from '@/services/session/access.service'
import { getSessionParticipantProfiles } from '@/repositories/session.repository'
import { sessionDisconnectCascadeService } from '@/services/session/disconnect-cascade.service'
import { resolveRoleForSessionJoin } from '@/services/session/authz.service'
import { broadcastSessionStatsSnapshot } from '@/services/session/stats.service'
import { appendSessionAuditEvent } from '@/services/runtime/runtime-streams.service'
import { advanceSessionScheduleOnEnded } from '@/services/campaign-schedule.service'
import { resolveCooldownControlAuthorization } from '@/services/session/cooldown-authz.service'
import { broadcastLobbyStatsUpdated } from '@/services/lobby/lobby-stats.service'
import {
  isSessionActiveOrPaused,
  SESSION_COOLDOWN_EXTENSION_MAX_MS,
  SESSION_COOLDOWN_EXTENSION_MIN_MS,
  SESSION_COOLDOWN_EXTENSION_STEP_MS,
  STANDALONE_SESSION_COOLDOWN_MS,
} from '@/constants/session.constants'
import { SESSION_EVENT_TYPES } from '@/constants/session-events.constants'
import type { WebSocketManager } from '@/ws'
import eventBroadcaster from '@/ws/event-broadcaster'
import { clearSessionRecoveryState } from '@/ws/state-recovery'

const router = Router()
const prisma = getPrismaClient()

type CampaignLateJoinSettings = {
  lateJoinPolicy: 'OPEN' | 'SCREENED' | 'BLOCKED'
  lateJoinGraceMinutes: number
}

async function getEffectiveCooldownDurationMs(sessionId: UUID): Promise<number> {
  let result: { campaign: { postSessionChatDurationMs: number } | null } | null = null

  try {
    const sessionModel = (
      prisma as typeof prisma & {
        session?: {
          findUnique?: (...args: any[]) => Promise<any>
        }
      }
    ).session

    if (sessionModel?.findUnique) {
      result = await sessionModel.findUnique({
        where: { id: sessionId },
        select: {
          campaign: {
            select: {
              postSessionChatDurationMs: true,
            },
          },
        },
      })
    }
  } catch {
    result = null
  }

  const configured = result?.campaign?.postSessionChatDurationMs ?? STANDALONE_SESSION_COOLDOWN_MS
  const clamped = Math.max(
    SESSION_COOLDOWN_EXTENSION_MIN_MS,
    Math.min(SESSION_COOLDOWN_EXTENSION_MAX_MS, configured)
  )

  return clamped
}

async function getCampaignLateJoinSettings(
  sessionId: UUID,
  session?: {
    campaign?: { lateJoinPolicy?: string | null; lateJoinGraceMinutes?: number | null } | null
  }
): Promise<CampaignLateJoinSettings | null> {
  if (session?.campaign) {
    return {
      lateJoinPolicy: (session.campaign.lateJoinPolicy ??
        'OPEN') as CampaignLateJoinSettings['lateJoinPolicy'],
      lateJoinGraceMinutes: session.campaign.lateJoinGraceMinutes ?? 30,
    }
  }

  try {
    const sessionModel = (
      prisma as typeof prisma & {
        session?: {
          findUnique?: (...args: any[]) => Promise<any>
        }
      }
    ).session

    if (!sessionModel?.findUnique) {
      return null
    }

    const result = await sessionModel.findUnique({
      where: { id: sessionId },
      select: {
        campaign: {
          select: {
            lateJoinPolicy: true,
            lateJoinGraceMinutes: true,
          },
        },
      },
    })

    if (!result?.campaign) {
      return null
    }

    return {
      lateJoinPolicy: result.campaign.lateJoinPolicy ?? 'OPEN',
      lateJoinGraceMinutes: result.campaign.lateJoinGraceMinutes ?? 30,
    }
  } catch {
    return null
  }
}

function getLateJoinRestrictionMessage(settings: CampaignLateJoinSettings): string {
  if (settings.lateJoinPolicy === 'SCREENED') {
    return `Late joins now require DM screening. Ask the DM to review your join after the first ${settings.lateJoinGraceMinutes} minutes.`
  }

  return `Late joins are blocked after the first ${settings.lateJoinGraceMinutes} minutes of an active session.`
}

function computeCooldownExpiresAt(params: {
  state: string
  endedAt?: number | null
  cooldownDurationMs: number
}): number | undefined {
  if (params.state !== SessionStateEnum.COOLDOWN) {
    return undefined
  }

  const endedAtMs = Number(params.endedAt)
  if (!Number.isFinite(endedAtMs)) {
    return undefined
  }

  return endedAtMs + params.cooldownDurationMs
}

async function hasConnectedTableMembers(sessionId: UUID): Promise<boolean> {
  const [members, presence] = await Promise.all([
    getSessionUsers(sessionId),
    getSessionPresence(sessionId),
  ])

  const tableMemberIds = new Set(
    members
      .filter((member) => member.role === Role.DM || member.role === Role.PLAYER)
      .map((member) => member.id)
  )

  if (tableMemberIds.size === 0) {
    return false
  }

  return presence.some(
    (entry) => tableMemberIds.has(entry.userId) && entry.state !== PresenceState.OFFLINE
  )
}

async function maybeTriggerEndedCleanupOnExplicitExit(sessionId: UUID): Promise<void> {
  const session = await getSession(sessionId)
  if (!session || session.state !== SessionStateEnum.ENDED) {
    return
  }

  const hasConnectedTable = await hasConnectedTableMembers(sessionId)
  if (hasConnectedTable) {
    return
  }

  sessionCleanupJobService.notifyExplicitSessionExit(sessionId)
}

async function broadcastCampaignListInvalidatedForSession(params: {
  sessionId: UUID
  actorUserId: UUID
  actorUserRole: Role
  reason: 'SESSION_STATE_CHANGED' | 'SESSION_COOLDOWN_ENDED' | 'EXPLICIT_EXIT'
}): Promise<void> {
  if (!eventBroadcaster.isReady()) {
    return
  }

  const sessionCampaign = await prisma.session.findUnique({
    where: { id: params.sessionId },
    select: { campaignId: true },
  })

  if (!sessionCampaign?.campaignId) {
    return
  }

  eventBroadcaster.sendToAllAuthenticated({
    id: crypto.randomUUID() as UUID,
    type: 'CAMPAIGN:LIST_INVALIDATED',
    version: 1,
    userId: params.actorUserId,
    userRole: params.actorUserRole,
    sessionId: null as unknown as UUID,
    roomId: null,
    timestamp: Date.now(),
    payload: {
      campaignId: sessionCampaign.campaignId as UUID,
      reason: params.reason,
    },
  })

  await eventBroadcaster.broadcastToCampaignMembers(sessionCampaign.campaignId as UUID, {
    id: crypto.randomUUID() as UUID,
    type: 'CAMPAIGN:PARTY_PRESENCE_UPDATED',
    version: 1,
    userId: params.actorUserId,
    userRole: params.actorUserRole,
    sessionId: null as unknown as UUID,
    roomId: null,
    timestamp: Date.now(),
    payload: {
      campaignId: sessionCampaign.campaignId as UUID,
      sessionId: params.sessionId,
      reason: params.reason,
      changedAt: Date.now(),
    },
  })
}

/**
 * Middleware: Verify auth token exists
 */
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractTokenFromHeader(req.headers.authorization)
  if (!token) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Missing or invalid Authorization header',
    })
  }

  const user = verifyToken(token)
  if (!user) {
    return res.status(401).json({
      code: ErrorCode.UNAUTHORIZED,
      message: 'Authentication required',
    })
  }

  ;(req as any).user = user
  next()
}

function requireDM(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user
  if (!user || user.role !== 'DM') {
    return res.status(403).json({
      code: ErrorCode.FORBIDDEN,
      message: 'DM role required',
    })
  }
  next()
}

function internalErrorResponse(res: Response) {
  return res.status(500).json({
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Internal server error',
  })
}

function normalizeRoomName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function getBoundaryRoomIds(params: {
  boundaryType:
    | 'SESSION_STARTED'
    | 'SESSION_PAUSED'
    | 'SESSION_RESUMED'
    | 'SESSION_COOLDOWN'
    | 'SESSION_ENDED'
  mainRoomId: UUID
  greenRoomId: UUID
}): UUID[] {
  if (
    params.boundaryType === 'SESSION_STARTED' ||
    params.boundaryType === 'SESSION_COOLDOWN' ||
    params.boundaryType === 'SESSION_ENDED'
  ) {
    return Array.from(new Set([params.mainRoomId, params.greenRoomId]))
  }

  return [params.mainRoomId]
}

type SessionBoundaryEventType =
  | 'SESSION_STARTED'
  | 'SESSION_PAUSED'
  | 'SESSION_RESUMED'
  | 'SESSION_COOLDOWN'
  | 'SESSION_ENDED'

async function ensureJoinedMemberPresence(params: {
  session: Awaited<ReturnType<typeof getSession>>
  userId: UUID
  username: string
}): Promise<{
  changed: boolean
  roomId?: UUID
  state?: PresenceState
  previousGroupId?: UUID
  userMuted?: boolean
}> {
  if (!params.session) {
    return { changed: false }
  }

  await ensureSessionDefaultRoomsForSession(params.session.id, params.session.dmId)

  const rooms = await getRooms(params.session.id)
  const mainRoom =
    rooms.find((room) => room.type === RoomType.MAIN) ||
    rooms.find((room) => normalizeRoomName(room.name) === 'main')
  const greenRoom =
    rooms.find((room) => normalizeRoomName(room.name) === 'green room') ||
    rooms.find((room) => normalizeRoomName(room.name) === 'green-room')

  const shouldUseMain = isSessionActiveOrPaused(params.session.state)

  if (shouldUseMain) {
    await ensureSessionWhisperRoomForSession(params.session.id, params.session.dmId)
  }

  const currentPresence = (await getSessionPresence(params.session.id)).find(
    (presence) => presence.userId === params.userId
  )

  const hasValidExistingRoom = Boolean(
    currentPresence?.primaryRoomId &&
    rooms.some((room) => room.id === currentPresence.primaryRoomId)
  )

  // ENDED/CLEANUP/IDLE remain online-staged in-room; OFFLINE is reserved for
  // explicit disconnect/leave paths.
  const targetState = PresenceState.ONLINE

  if (hasValidExistingRoom && currentPresence?.primaryRoomId) {
    if (currentPresence.state === targetState) {
      return {
        changed: false,
        roomId: currentPresence.primaryRoomId,
        state: targetState,
        previousGroupId: currentPresence.previousGroupId,
      }
    }

    const preservedPresence = await joinRoom({
      sessionId: params.session.id,
      roomId: currentPresence.primaryRoomId,
      userId: params.userId,
      username: params.username,
      state: targetState,
    })

    if (!preservedPresence) {
      return { changed: false }
    }

    return {
      changed: true,
      roomId: preservedPresence.primaryRoomId,
      state: preservedPresence.state,
      previousGroupId: preservedPresence.previousGroupId,
      userMuted: preservedPresence.userMuted,
    }
  }

  const targetRoom = shouldUseMain ? mainRoom || greenRoom : greenRoom || mainRoom

  if (!targetRoom) {
    return { changed: false }
  }

  if (currentPresence?.primaryRoomId === targetRoom.id && currentPresence.state === targetState) {
    return {
      changed: false,
      roomId: targetRoom.id,
      state: targetState,
      previousGroupId: currentPresence.previousGroupId,
    }
  }

  const nextPresence = await joinRoom({
    sessionId: params.session.id,
    roomId: targetRoom.id,
    userId: params.userId,
    username: params.username,
    state: targetState,
  })

  if (!nextPresence) {
    return { changed: false }
  }

  return {
    changed: true,
    roomId: targetRoom.id,
    state: targetState,
    previousGroupId: nextPresence.previousGroupId,
    userMuted: nextPresence.userMuted,
  }
}

async function listSessionMembersHandler(req: Request, res: Response) {
  const user = (req as any).user
  const { id } = req.params

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  try {
    const result = await listSessionUsersForRequester({
      sessionId: id as UUID,
      requester: {
        userId: user.userId,
        role: user.role,
      },
    })

    if (!result.ok) {
      if (result.code === 'SESSION_NOT_FOUND') {
        return res.status(404).json({
          code: ErrorCode.SESSION_NOT_FOUND,
          message: result.message,
        })
      }

      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: result.message,
      })
    }

    return res.status(200).json({
      users: result.users,
    })
  } catch {
    return internalErrorResponse(res)
  }
}

/**
 * Emits SESSION:MEMBER_JOINED carrying the full character/presence profile for a user.
 * Must be called BEFORE ROOM:USER_JOINED so that presence is populated when room handlers run.
 */
async function broadcastMemberJoined(params: {
  wsManager: WebSocketManager
  sessionId: UUID
  userId: UUID
  userRole: Role
  username: string
  primaryRoomId: UUID | null
  state: PresenceState
  userMuted?: boolean
}): Promise<void> {
  const profiles = await getSessionParticipantProfiles(params.sessionId)
  const profile = profiles[params.userId] || {}
  const timestamp = Date.now()

  params.wsManager.broadcastEventToSession(params.sessionId, {
    id: crypto.randomUUID() as UUID,
    type: 'SESSION:MEMBER_JOINED',
    version: 1,
    userId: params.userId,
    userRole: params.userRole,
    sessionId: params.sessionId,
    roomId: params.primaryRoomId,
    timestamp,
    payload: {
      userId: params.userId,
      username: params.username,
      role: params.userRole,
      playerName: (profile as any).playerName ?? null,
      avatarUrl: (profile as any).avatarUrl ?? null,
      characterName: (profile as any).characterName ?? null,
      characterClass: (profile as any).characterClass ?? null,
      characterSubclass: (profile as any).characterSubclass ?? null,
      characterRace: (profile as any).characterRace ?? null,
      level: (profile as any).level ?? null,
      characterStats: (profile as any).characterStats ?? null,
      primaryRoomId: params.primaryRoomId,
      state: params.state,
      ghost: false,
      joinedAt: timestamp,
      userMuted: params.userMuted ?? false,
    },
  })
}

async function joinSessionHandler(req: Request, res: Response) {
  const user = (req as any).user
  const { id } = req.params

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  try {
    let session = await getSession(id as UUID)
    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    if (session.state === SessionStateEnum.CLEANUP) {
      return res.status(409).json({
        code: ErrorCode.INVALID_STATE_TRANSITION,
        message:
          'This session is archived. Refresh the campaign to get the next available session.',
      })
    }

    const currentUsers = await getSessionUsers(id as UUID)
    const alreadyMember = currentUsers.some((u) => u.id === user.userId)

    if (alreadyMember) {
      const ensured = await ensureJoinedMemberPresence({
        session,
        userId: user.userId as UUID,
        username: user.username,
      })

      const wsManager: WebSocketManager | undefined = req.app.locals.wsManager

      if (wsManager && ensured.changed && ensured.roomId && ensured.state) {
        const timestamp = Date.now()

        await broadcastMemberJoined({
          wsManager,
          sessionId: id as UUID,
          userId: user.userId as UUID,
          userRole: user.role,
          username: user.username,
          primaryRoomId: ensured.roomId,
          state: ensured.state,
          userMuted: ensured.userMuted,
        })

        wsManager.broadcastEventToSession(id as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'ROOM:USER_JOINED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: id as UUID,
          roomId: ensured.roomId,
          timestamp,
          payload: {
            roomId: ensured.roomId,
            userId: user.userId as UUID,
            username: user.username,
            joinedAt: timestamp,
          },
        })

        wsManager.broadcastEventToSession(id as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'PRESENCE:STATE_CHANGED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: id as UUID,
          roomId: ensured.roomId,
          timestamp,
          payload: {
            roomId: ensured.roomId,
            userId: user.userId as UUID,
            username: user.username,
            newState: ensured.state,
            changedAt: timestamp,
            previousGroupId: ensured.previousGroupId || null,
          },
        })

        await broadcastSessionStatsSnapshot({
          wsManager,
          sessionId: id as UUID,
          actorUserId: user.userId as UUID,
          actorUserRole: user.role,
        })
      }

      const usersAfterJoin = await getSessionUsers(id as UUID)

      return res.status(200).json({
        session,
        users: usersAfterJoin.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
        })),
      })
    }

    const joinRole = await resolveRoleForSessionJoin({
      sessionId: id as UUID,
      userId: user.userId as UUID,
    })

    if (!joinRole.ok) {
      if (joinRole.code === 'SESSION_NOT_FOUND') {
        return res.status(404).json({
          code: ErrorCode.SESSION_NOT_FOUND,
          message: joinRole.message,
        })
      }

      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: joinRole.message,
      })
    }

    if (joinRole.role === Role.PLAYER && isSessionActiveOrPaused(session.state)) {
      const lateJoinSettings = await getCampaignLateJoinSettings(id as UUID, session as any)
      const sessionStartedAt = session.startedAt ?? session.createdAt
      const sessionStartedAtMs = sessionStartedAt
        ? new Date(sessionStartedAt).getTime()
        : Number.NaN

      if (
        lateJoinSettings &&
        lateJoinSettings.lateJoinPolicy !== 'OPEN' &&
        Number.isFinite(sessionStartedAtMs)
      ) {
        const graceWindowMs = lateJoinSettings.lateJoinGraceMinutes * 60_000
        const withinGraceWindow = Date.now() - sessionStartedAtMs <= graceWindowMs

        if (!withinGraceWindow) {
          return res.status(403).json({
            code: ErrorCode.FORBIDDEN,
            message: getLateJoinRestrictionMessage(lateJoinSettings),
          })
        }
      }
    }

    const success = await addUserToSession(id as UUID, {
      id: user.userId as UUID,
      username: user.username,
      role: joinRole.role,
      createdAt: Date.now(),
    })

    if (!success) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    await logSessionJoin(id as UUID, user.userId as UUID, user.username)

    await appendSessionAuditEvent({
      sessionId: id as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'SESSION_MEMBER_JOINED',
      targetType: 'SESSION_MEMBERSHIP',
      targetId: user.userId as UUID,
      visibilityClass: 'SYSTEM',
      metadata: {
        role: joinRole.role,
      },
    })

    const ensured = await ensureJoinedMemberPresence({
      session,
      userId: user.userId as UUID,
      username: user.username,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      if (ensured.changed && ensured.roomId && ensured.state) {
        const timestamp = Date.now()

        await broadcastMemberJoined({
          wsManager,
          sessionId: id as UUID,
          userId: user.userId as UUID,
          userRole: user.role,
          username: user.username,
          primaryRoomId: ensured.roomId,
          state: ensured.state,
          userMuted: ensured.userMuted,
        })

        wsManager.broadcastEventToSession(id as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'ROOM:USER_JOINED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: id as UUID,
          roomId: ensured.roomId,
          timestamp,
          payload: {
            roomId: ensured.roomId,
            userId: user.userId as UUID,
            username: user.username,
            joinedAt: timestamp,
          },
        })

        wsManager.broadcastEventToSession(id as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'PRESENCE:STATE_CHANGED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: id as UUID,
          roomId: ensured.roomId,
          timestamp,
          payload: {
            roomId: ensured.roomId,
            userId: user.userId as UUID,
            username: user.username,
            newState: ensured.state,
            changedAt: timestamp,
            previousGroupId: ensured.previousGroupId || null,
          },
        })
      }

      wsManager.broadcastEventToSession(id as UUID, {
        id: crypto.randomUUID() as UUID,
        type: 'CHAT:MESSAGE_CREATED',
        version: 1,
        userId: session.dmId,
        userRole: Role.DM,
        sessionId: id as UUID,
        roomId: null as any,
        timestamp: Date.now(),
        payload: {
          messageId: crypto.randomUUID() as UUID,
          authorId: session.dmId,
          authorUsername: 'System',
          sessionId: id as UUID,
          roomId: null as any,
          content: `${user.username} joined the session`,
          type: 'SYSTEM',
          isEdited: false,
          createdAt: Date.now(),
          whisperTo: null,
        },
      })

      await broadcastSessionStatsSnapshot({
        wsManager,
        sessionId: id as UUID,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role,
      })
    }

    const updatedUsers = await getSessionUsers(id as UUID)
    return res.status(200).json({
      session,
      users: updatedUsers.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
      })),
    })
  } catch {
    return internalErrorResponse(res)
  }
}

async function leaveSessionHandler(req: Request, res: Response) {
  const user = (req as any).user
  const { id } = req.params

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  try {
    const session = await getSession(id as UUID)
    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    if (session.dmId === (user.userId as UUID)) {
      const previousPresence = (await getSessionPresence(id as UUID)).find(
        (entry) => entry.userId === (user.userId as UUID)
      )

      await removePresenceProjection({
        sessionId: id as UUID,
        userId: user.userId as UUID,
      })

      const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
      if (wsManager) {
        wsManager.broadcastEventToSession(id as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'PRESENCE:STATE_CHANGED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: id as UUID,
          roomId: previousPresence?.primaryRoomId || null,
          timestamp: Date.now(),
          payload: {
            roomId: previousPresence?.primaryRoomId || null,
            userId: user.userId as UUID,
            username: user.username,
            presence: PresenceState.OFFLINE,
            previousState: previousPresence?.state || PresenceState.ONLINE,
            newState: PresenceState.OFFLINE,
            changedAt: Date.now(),
            previousGroupId: previousPresence?.previousGroupId || null,
          },
        })

        wsManager.broadcastEventToSession(id as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'SESSION:MEMBER_LEFT',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: id as UUID,
          roomId: previousPresence?.primaryRoomId || null,
          timestamp: Date.now(),
          payload: {
            userId: user.userId as UUID,
            username: user.username,
            leftAt: Date.now(),
            reason: 'VOLUNTARY',
          },
        })

        sessionDisconnectCascadeService.cancelUserTimers(id as UUID, user.userId as UUID)

        await broadcastSessionStatsSnapshot({
          wsManager,
          sessionId: id as UUID,
          actorUserId: user.userId as UUID,
          actorUserRole: user.role,
        })
      }

      await appendSessionAuditEvent({
        sessionId: id as UUID,
        actorUserId: user.userId as UUID,
        actorRole: user.role,
        actionType: 'SESSION_DM_EXITED_TO_LOBBY',
        targetType: 'USER',
        targetId: user.userId as UUID,
        visibilityClass: 'SYSTEM',
        metadata: {
          clearedPresenceProjection: true,
        },
      })

      await broadcastCampaignListInvalidatedForSession({
        sessionId: id as UUID,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role as Role,
        reason: 'EXPLICIT_EXIT',
      })
      await broadcastLobbyStatsUpdated(user.userId as UUID, user.role as Role)
      await maybeTriggerEndedCleanupOnExplicitExit(id as UUID)

      const users = await getSessionUsers(id as UUID)
      return res.status(200).json({
        session,
        users: users.map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role,
        })),
      })
    }

    const currentUsers = await getSessionUsers(id as UUID)
    const isMember = currentUsers.some((u) => u.id === user.userId)
    if (!isMember) {
      return res.status(404).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'User is not a member of this session',
      })
    }

    const previousPresence = (await getSessionPresence(id as UUID)).find(
      (entry) => entry.userId === (user.userId as UUID)
    )

    const removal = await removeUserFromSession(id as UUID, user.userId as UUID)

    if (!removal.removed) {
      return res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to remove user from session',
      })
    }

    // Clear presence projection and cancel any pending ghost/TTL timers immediately.
    await removePresenceProjection({ sessionId: id as UUID, userId: user.userId as UUID })
    sessionDisconnectCascadeService.cancelUserTimers(id as UUID, user.userId as UUID)

    await logSessionLeave(id as UUID, user.userId as UUID, user.username)

    await appendSessionAuditEvent({
      sessionId: id as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'SESSION_MEMBER_LEFT',
      targetType: 'SESSION_MEMBERSHIP',
      targetId: user.userId as UUID,
      visibilityClass: 'SYSTEM',
      metadata: {
        promotedSpectator: removal.promotedSpectator.promoted,
      },
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      wsManager.broadcastEventToSession(id as UUID, {
        id: crypto.randomUUID() as UUID,
        type: 'SESSION:MEMBER_LEFT',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: id as UUID,
        roomId: previousPresence?.primaryRoomId || null,
        timestamp: Date.now(),
        payload: {
          userId: user.userId as UUID,
          username: user.username,
          leftAt: Date.now(),
          reason: 'VOLUNTARY',
        },
      })

      wsManager.broadcastEventToSession(id as UUID, {
        id: crypto.randomUUID() as UUID,
        type: 'CHAT:MESSAGE_CREATED',
        version: 1,
        userId: session.dmId,
        userRole: Role.DM,
        sessionId: id as UUID,
        roomId: null as any,
        timestamp: Date.now(),
        payload: {
          messageId: crypto.randomUUID() as UUID,
          authorId: session.dmId,
          authorUsername: 'System',
          sessionId: id as UUID,
          roomId: null as any,
          content: `${user.username} left the session`,
          type: 'SYSTEM',
          isEdited: false,
          createdAt: Date.now(),
          whisperTo: null,
        },
      })

      if (removal.promotedSpectator.promoted) {
        wsManager.broadcastEventToSession(id as UUID, {
          id: crypto.randomUUID() as UUID,
          type: 'CHAT:MESSAGE_CREATED',
          version: 1,
          userId: session.dmId,
          userRole: Role.DM,
          sessionId: id as UUID,
          roomId: null as any,
          timestamp: Date.now(),
          payload: {
            messageId: crypto.randomUUID() as UUID,
            authorId: session.dmId,
            authorUsername: 'System',
            sessionId: id as UUID,
            roomId: null as any,
            content: `${removal.promotedSpectator.user.username} was promoted from the spectator waitlist`,
            type: 'SYSTEM',
            isEdited: false,
            createdAt: Date.now(),
            whisperTo: null,
          },
        })
      }
    }

    const updatedUsers = await getSessionUsers(id as UUID)

    await broadcastCampaignListInvalidatedForSession({
      sessionId: id as UUID,
      actorUserId: user.userId as UUID,
      actorUserRole: user.role as Role,
      reason: 'EXPLICIT_EXIT',
    })
    await broadcastLobbyStatsUpdated(user.userId as UUID, user.role as Role)
    await maybeTriggerEndedCleanupOnExplicitExit(id as UUID)

    return res.status(200).json({
      session,
      users: updatedUsers.map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
      })),
    })
  } catch {
    return internalErrorResponse(res)
  }
}

/**
 * POST /api/session
 * Create a new session (DM-only)
 */
router.post('/', requireAuth, requireDM, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { name, description } = req.body

  if (!isValidSessionName(name)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid session name',
      field: 'name',
    })
  }

  try {
    const session = await createSession(name, user.userId, description)

    await appendSessionAuditEvent({
      sessionId: session.id,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'SESSION_CREATED',
      targetType: 'SESSION',
      targetId: session.id,
      visibilityClass: 'SYSTEM',
      metadata: {
        name: session.name,
      },
    })

    res.status(201).json(session)
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * GET /api/session
 * List all sessions
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessions = await getAllSessions()
    res.status(200).json(sessions)
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * GET /api/session/:id
 * Get a specific session
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  try {
    const session = await getSession(id as UUID)
    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    const cooldownDurationMs = await getEffectiveCooldownDurationMs(id as UUID)
    const cooldownExpiresAt = computeCooldownExpiresAt({
      state: session.state,
      endedAt: session.endedAt,
      cooldownDurationMs,
    })

    const users = await getSessionUsers(id as UUID)
    res.status(200).json({
      ...session,
      cooldownExpiresAt,
      userCount: users.length,
    })
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * GET /api/session/:id/users
 * List users currently associated with a session.
 */
router.get('/:id/users', requireAuth, listSessionMembersHandler)
router.get('/:id/members', requireAuth, listSessionMembersHandler)

/**
 * GET /api/session/:id/logs
 * Get session event logs
 */
router.get('/:id/logs', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { id } = req.params
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
  const offset = parseInt(req.query.offset as string) || 0

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  try {
    const result = await listSessionLogsForRequester({
      sessionId: id as UUID,
      requester: {
        userId: user.userId,
        role: user.role,
      },
      limit,
      offset,
    })

    if (!result.ok) {
      if (result.code === 'SESSION_NOT_FOUND') {
        return res.status(404).json({
          code: ErrorCode.SESSION_NOT_FOUND,
          message: result.message,
        })
      }

      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: result.message,
      })
    }

    return res.status(200).json({ logs: result.logs })
  } catch {
    return internalErrorResponse(res)
  }
})

/**
 * PUT /api/session/:id/state
 * Change session state (start, pause, resume, end)
 * Session-owner operation.
 */
router.put('/:id/state', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { id } = req.params
  const { state } = req.body

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  const requestedState = normalizeSessionState(state)

  if (!requestedState || requestedState === 'CLEANUP') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid state',
      field: 'state',
    })
  }

  try {
    const previousSession = await getSession(id as UUID)
    if (!previousSession) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    let transitionActorUserId = user.userId as UUID
    if (previousSession.dmId !== (user.userId as UUID)) {
      const requestingCooldownCancel =
        previousSession.state === 'COOLDOWN' && requestedState === 'IDLE'

      if (!requestingCooldownCancel) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: 'Only DM can change session state',
        })
      }

      const cooldownAuth = await resolveCooldownControlAuthorization({
        sessionId: id as UUID,
        requesterUserId: user.userId as UUID,
      })

      if (!cooldownAuth.ok || !cooldownAuth.transitionActorUserId) {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: cooldownAuth.message || 'Cooldown controls are not available.',
        })
      }

      transitionActorUserId = cooldownAuth.transitionActorUserId
    }

    const session = await updateSessionState(id as UUID, requestedState, transitionActorUserId)
    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    if (requestedState === SessionStateEnum.IDLE || requestedState === SessionStateEnum.ENDED) {
      await disableMockSimulationForSessionExit(session.id)
    }

    const users = await getSessionUsers(id as UUID)
    const transition = await applySessionStateRoomTransition({
      sessionId: session.id,
      dmId: session.dmId,
      previousState: previousSession?.state || null,
      nextState: requestedState,
      users: users.map((member) => ({
        id: member.id,
        username: member.username,
      })),
    })

    const audioStateBeforeReset = await getSessionAudioState(session.id)
    await clearSessionDMOverrideState(session.id)

    // Only clear environment for the neutral room (main or greenroom), not other groups.
    // ACTIVE, PAUSED, and COOLDOWN are all staged in Main Room.
    const neutralRoomId =
      isSessionActiveOrPaused(requestedState) || requestedState === 'COOLDOWN'
        ? transition.mainRoomId
        : transition.greenRoomId

    await clearRoomEnvironmentState({
      sessionId: session.id,
      roomId: neutralRoomId,
    })

    if (requestedState === 'COOLDOWN') {
      await deletePrivateRoomsForEndedSession(session.id)
    }

    await appendSessionAuditEvent({
      sessionId: session.id,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'SESSION_STATE_CHANGED',
      targetType: 'SESSION',
      targetId: session.id,
      roomId: transition.targetRoomId,
      visibilityClass: 'SYSTEM',
      metadata: {
        previousState: previousSession.state,
        nextState: session.state,
        movedUsersCount: transition.movedUsers,
        targetRoomId: transition.targetRoomId,
      },
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager

    const movedToGreenRoom = transition.targetRoomId === transition.greenRoomId
    const shouldClearGreenRoomContext = movedToGreenRoom && requestedState === 'ENDED'

    if (shouldClearGreenRoomContext) {
      await clearRoomMessages(session.id, transition.greenRoomId)
    }

    const boundaryTypes: SessionBoundaryEventType[] =
      requestedState === 'ACTIVE'
        ? [previousSession?.state === 'PAUSED' ? 'SESSION_RESUMED' : 'SESSION_STARTED']
        : requestedState === 'PAUSED'
          ? ['SESSION_PAUSED']
          : requestedState === 'COOLDOWN'
            ? ['SESSION_COOLDOWN']
            : []

    for (const boundaryType of boundaryTypes) {
      await emitSessionBoundarySystemMessage({
        sessionId: session.id,
        roomIds: getBoundaryRoomIds({
          boundaryType,
          mainRoomId: transition.mainRoomId,
          greenRoomId: transition.greenRoomId,
        }),
        sessionName: session.name,
        boundaryType,
        dmId: user.userId as UUID,
        dmUsername: user.username,
        wsManager,
      })
    }

    if (boundaryTypes.length > 0) {
      // Log the state change
      await logSessionStateChange(
        session.id,
        user.userId as UUID,
        user.username,
        previousSession?.state || 'UNKNOWN',
        toPublicSessionState(requestedState) ?? requestedState
      )

      // Emit session summary card to greenroom when transitioning to COOLDOWN
      if (boundaryTypes.includes('SESSION_COOLDOWN') && transition.greenRoomId) {
        void emitSessionSummaryMessage({
          session,
          users,
          greenRoomId: transition.greenRoomId,
          dmId: user.userId as UUID,
          dmUsername: user.username,
          wsManager,
        }).catch((err) => {
          console.error('[session summary] failed to emit summary message', err)
        })
      }

      // Emit a previous-session recap card after SESSION_STARTED (not resume from pause)
      if (boundaryTypes.includes('SESSION_STARTED') && transition.mainRoomId) {
        void emitSessionRecapMessage({
          sessionId: session.id,
          mainRoomId: transition.mainRoomId,
          dmId: user.userId as UUID,
          dmUsername: user.username,
          wsManager,
        }).catch((err) => {
          console.error('[session recap] failed to emit recap message', err)
        })
      }
    }

    if (wsManager) {
      wsManager.broadcastEventToSession(session.id, {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:SESSION_TRANSITION_APPLIED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: session.id,
        roomId: transition.targetRoomId,
        timestamp: Date.now(),
        payload: {
          previousState: previousSession?.state || null,
          nextState: session.state,
          movedUsers: transition.movedUsers,
          targetState: transition.targetState,
          mainRoom: {
            id: transition.mainRoomId,
            name: transition.mainRoomName,
            roomType: 'MAIN',
          },
          greenRoom: {
            id: transition.greenRoomId,
            name: transition.greenRoomName,
            roomType: 'GROUP',
          },
          targetRoomId: transition.targetRoomId,
          targetRoomName: transition.targetRoomName,
          users: transition.users.map((member) => ({
            userId: member.id,
            username: member.username,
            roomId: member.roomId,
            roomName: member.roomName,
            previousGroupId: member.previousGroupId || null,
          })),
        },
      })

      for (const override of audioStateBeforeReset.dmOverrides) {
        wsManager.broadcastEventToSession(session.id, {
          id: crypto.randomUUID() as UUID,
          type: 'AUDIO:DM_OVERRIDE_REMOVED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: session.id,
          roomId: null,
          timestamp: Date.now(),
          payload: {
            targetUserId: override.targetUserId,
            dmId: user.userId,
            overrideType: override.overrideType,
            removedAt: Date.now(),
          },
        })
      }

      if (audioStateBeforeReset.broadcast.enabled) {
        wsManager.broadcastEventToSession(session.id, {
          id: crypto.randomUUID() as UUID,
          type: 'AUDIO:BROADCAST_STATE_CHANGED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: session.id,
          roomId: null,
          timestamp: Date.now(),
          payload: {
            dmId: session.dmId,
            enabled: false,
            broadcastRoomId: audioStateBeforeReset.broadcast.broadcastRoomId,
            changedAt: Date.now(),
          },
        })
      }

      if (shouldClearGreenRoomContext) {
        wsManager.broadcastEventToSession(session.id, {
          id: crypto.randomUUID() as UUID,
          type: 'CHAT:ROOM_CONTEXT_CLEARED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: session.id,
          roomId: transition.greenRoomId,
          timestamp: Date.now(),
          payload: {
            roomId: transition.greenRoomId,
            reason: 'SESSION_RETURNED_TO_GREENROOM',
          },
        })
      }

      await broadcastSessionStatsSnapshot({
        wsManager,
        sessionId: session.id,
        actorUserId: user.userId as UUID,
        actorUserRole: user.role,
      })

      // Broadcast SESSION:COOLDOWN_STARTED when transitioning to COOLDOWN
      if (requestedState === 'COOLDOWN') {
        const cooldownDurationMs = await getEffectiveCooldownDurationMs(session.id)
        const cooldownStartedAt = session.endedAt ?? Date.now()
        const cooldownExpiresAt = cooldownStartedAt + cooldownDurationMs
        wsManager.broadcastEventToSession(session.id, {
          id: crypto.randomUUID() as UUID,
          type: 'SESSION:COOLDOWN_STARTED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: session.id,
          roomId: null,
          timestamp: Date.now(),
          payload: {
            cooldownStartedAt,
            cooldownExpiresAt,
          },
        })
      }

      // Broadcast SESSION:STATE_CHANGED so all clients update their session state
      // without needing a page refresh. This must fire after all other transition
      // events so clients can derive the final state from the authoritative value.
      wsManager.broadcastEventToSession(session.id, {
        id: crypto.randomUUID() as UUID,
        type: 'SESSION:STATE_CHANGED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: session.id,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          state: session.state,
          previousState: previousSession?.state || null,
        },
      })
    }

    const cooldownDurationMs = await getEffectiveCooldownDurationMs(session.id)
    const cooldownExpiresAt = computeCooldownExpiresAt({
      state: session.state,
      endedAt: session.endedAt,
      cooldownDurationMs,
    })

    if (requestedState === SessionStateEnum.COOLDOWN) {
      sessionCleanupJobService.notifyLifecycleTrigger('COOLDOWN_STARTED')
    }

    if (session.state === SessionStateEnum.ENDED || session.state === SessionStateEnum.CLEANUP) {
      clearSessionRecoveryState(session.id)
    }

    await broadcastLobbyStatsUpdated(user.userId as UUID, user.role as Role)
    await broadcastCampaignListInvalidatedForSession({
      sessionId: session.id,
      actorUserId: user.userId as UUID,
      actorUserRole: user.role as Role,
      reason: 'SESSION_STATE_CHANGED',
    })

    res.status(200).json({
      ...session,
      cooldownExpiresAt,
    })
  } catch (err: any) {
    console.error('[session.routes] state transition failed', {
      sessionId: id,
      requestedState,
      error: err instanceof Error ? err.message : String(err),
    })
    if (err.code === ErrorCode.FORBIDDEN) {
      return res.status(403).json(err)
    }
    if (err.code === ErrorCode.INVALID_STATE_TRANSITION) {
      return res.status(409).json(err)
    }
    return internalErrorResponse(res)
  }
})

router.post('/:id/cooldown/extend', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { id } = req.params
  const { extensionMs } = req.body || {}

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  const parsedExtensionMs = Number(extensionMs)
  if (
    !Number.isFinite(parsedExtensionMs) ||
    parsedExtensionMs < SESSION_COOLDOWN_EXTENSION_MIN_MS ||
    parsedExtensionMs > SESSION_COOLDOWN_EXTENSION_MAX_MS ||
    parsedExtensionMs % SESSION_COOLDOWN_EXTENSION_STEP_MS !== 0
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'extensionMs must be between 60000 and 900000 in 60000ms increments',
      field: 'extensionMs',
    })
  }

  try {
    const cooldownAuth = await resolveCooldownControlAuthorization({
      sessionId: id as UUID,
      requesterUserId: user.userId as UUID,
    })

    if (!cooldownAuth.ok || !cooldownAuth.transitionActorUserId) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: cooldownAuth.message || 'Cooldown controls are not available.',
      })
    }

    const cooldownExtensionCount = await countSessionCooldownExtensions(id as UUID)
    if (cooldownExtensionCount >= 3) {
      return res.status(409).json({
        code: ErrorCode.INVALID_STATE_TRANSITION,
        message: 'Cooldown can only be extended up to 3 times per session.',
      })
    }

    const nextCooldownExtensionCount = cooldownExtensionCount + 1

    const previousSession = await getSession(id as UUID)
    const session = await extendSessionCooldown(
      id as UUID,
      parsedExtensionMs,
      cooldownAuth.transitionActorUserId
    )

    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    const cooldownDurationMs = await getEffectiveCooldownDurationMs(session.id)
    const cooldownExpiresAt = computeCooldownExpiresAt({
      state: session.state,
      endedAt: session.endedAt,
      cooldownDurationMs,
    })

    if (wsManager) {
      wsManager.broadcastEventToSession(session.id, {
        id: crypto.randomUUID() as UUID,
        type: SESSION_EVENT_TYPES.COOLDOWN_EXTENDED,
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: session.id,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          state: session.state,
          extensionMs: parsedExtensionMs,
          previousEndedAt: previousSession?.endedAt ?? null,
          endedAt: session.endedAt ?? null,
          cooldownExpiresAt,
          extensionCount: nextCooldownExtensionCount,
        },
      })
    }

    await appendSessionAuditEvent({
      sessionId: session.id,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'SESSION_COOLDOWN_EXTENDED',
      targetType: 'SESSION',
      targetId: session.id,
      visibilityClass: 'SYSTEM',
      metadata: {
        extensionMs: parsedExtensionMs,
        extensionCount: nextCooldownExtensionCount,
      },
    })

    await logSessionCooldownExtended(
      session.id,
      user.userId as UUID,
      user.username,
      parsedExtensionMs
    )

    return res.status(200).json({
      session: {
        ...session,
        cooldownExpiresAt,
      },
      extensionCount: nextCooldownExtensionCount,
    })
  } catch (err: any) {
    if (err.code === ErrorCode.INVALID_STATE_TRANSITION) {
      return res.status(409).json(err)
    }
    if (err.code === ErrorCode.FORBIDDEN) {
      return res.status(403).json(err)
    }
    return internalErrorResponse(res)
  }
})

/**
 * POST /api/session/:id/reset
 * Explicit DM reset preparation for ENDED sessions.
 * Transitions ENDED -> CLEANUP so the DM can intentionally start a fresh IDLE session.
 */
router.post('/:id/reset', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { id } = req.params

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  try {
    const previousSession = await getSession(id as UUID)
    if (!previousSession) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    if (previousSession.dmId !== (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only DM can reset session',
      })
    }

    if (
      previousSession.state !== SessionStateEnum.ENDED &&
      previousSession.state !== SessionStateEnum.CLEANUP
    ) {
      return res.status(409).json({
        code: ErrorCode.INVALID_STATE_TRANSITION,
        message: 'Reset is only available for ENDED or CLEANUP sessions',
      })
    }

    let session = previousSession
    let transition: Awaited<ReturnType<typeof applySessionStateRoomTransition>> | null = null

    if (previousSession.state === SessionStateEnum.ENDED) {
      const updated = await updateSessionState(
        id as UUID,
        SessionStateEnum.CLEANUP,
        user.userId as UUID
      )

      if (!updated) {
        return res.status(404).json({
          code: ErrorCode.SESSION_NOT_FOUND,
          message: 'Session not found',
        })
      }

      session = updated
      await disableMockSimulationForSessionExit(session.id)

      const users = await getSessionUsers(id as UUID)
      transition = await applySessionStateRoomTransition({
        sessionId: session.id,
        dmId: session.dmId,
        previousState: previousSession.state,
        nextState: SessionStateEnum.CLEANUP,
        users: users.map((member) => ({
          id: member.id,
          username: member.username,
        })),
      })

      await appendSessionAuditEvent({
        sessionId: session.id,
        actorUserId: user.userId as UUID,
        actorRole: user.role,
        actionType: 'SESSION_STATE_CHANGED',
        targetType: 'SESSION',
        targetId: session.id,
        roomId: transition.targetRoomId,
        visibilityClass: 'SYSTEM',
        metadata: {
          previousState: previousSession.state,
          nextState: session.state,
          reason: 'SESSION_RESET',
        },
      })

      const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
      if (wsManager) {
        wsManager.broadcastEventToSession(session.id, {
          id: crypto.randomUUID() as UUID,
          type: 'ROOM:SESSION_TRANSITION_APPLIED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: session.id,
          roomId: transition.targetRoomId,
          timestamp: Date.now(),
          payload: {
            previousState: previousSession.state,
            nextState: session.state,
            movedUsers: transition.movedUsers,
            targetState: transition.targetState,
            mainRoom: {
              id: transition.mainRoomId,
              name: transition.mainRoomName,
              roomType: RoomType.MAIN,
            },
            greenRoom: {
              id: transition.greenRoomId,
              name: transition.greenRoomName,
              roomType: RoomType.GROUP,
            },
            targetRoomId: transition.targetRoomId,
            targetRoomName: transition.targetRoomName,
            users: transition.users.map((member) => ({
              userId: member.id,
              username: member.username,
              roomId: member.roomId,
              roomName: member.roomName,
              previousGroupId: member.previousGroupId || null,
            })),
          },
        })

        wsManager.broadcastEventToSession(session.id, {
          id: crypto.randomUUID() as UUID,
          type: 'SESSION:STATE_CHANGED',
          version: 1,
          userId: user.userId as UUID,
          userRole: user.role,
          sessionId: session.id,
          roomId: null,
          timestamp: Date.now(),
          payload: {
            state: session.state,
          },
        })

        await broadcastSessionStatsSnapshot({
          wsManager,
          sessionId: session.id,
          actorUserId: user.userId as UUID,
          actorUserRole: user.role,
        })
      }

      clearSessionRecoveryState(session.id)
    }

    await broadcastLobbyStatsUpdated(user.userId as UUID, user.role as Role)
    await broadcastCampaignListInvalidatedForSession({
      sessionId: session.id,
      actorUserId: user.userId as UUID,
      actorUserRole: user.role as Role,
      reason: 'SESSION_STATE_CHANGED',
    })

    return res.status(200).json({
      session,
      transitionApplied: Boolean(transition),
    })
  } catch (err: any) {
    if (err.code === ErrorCode.INVALID_STATE_TRANSITION) {
      return res.status(409).json(err)
    }
    if (err.code === ErrorCode.FORBIDDEN) {
      return res.status(403).json(err)
    }
    return internalErrorResponse(res)
  }
})

/**
 * POST /sessions/:id/cooldown/end
 * DM ends the post-session cooldown window early.
 * Immediately transitions session state from COOLDOWN to ENDED.
 */
router.post('/:id/cooldown/end', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { id } = req.params

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  try {
    const cooldownAuth = await resolveCooldownControlAuthorization({
      sessionId: id as UUID,
      requesterUserId: user.userId as UUID,
    })

    if (!cooldownAuth.ok || !cooldownAuth.transitionActorUserId) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: cooldownAuth.message || 'Cooldown controls are not available.',
      })
    }

    const previousSession = await getSession(id as UUID)
    const session = await endSessionCooldown(id as UUID, cooldownAuth.transitionActorUserId)

    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    if (session.state === SessionStateEnum.ENDED) {
      await disableMockSimulationForSessionExit(session.id)
      await openMainRoomMessageHistory(session.id)
    }

    const users = await getSessionUsers(id as UUID)
    const transition = await applySessionStateRoomTransition({
      sessionId: session.id,
      dmId: session.dmId,
      nextState: session.state,
      users: users.map((member) => ({
        id: member.id,
        username: member.username,
      })),
    })

    const movedToGreenRoom = transition.targetRoomId === transition.greenRoomId
    if (movedToGreenRoom && session.state === SessionStateEnum.ENDED) {
      await clearRoomMessages(session.id, transition.greenRoomId)
    }

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      wsManager.broadcastEventToSession(session.id, {
        id: crypto.randomUUID() as UUID,
        type: 'ROOM:SESSION_TRANSITION_APPLIED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: session.id,
        roomId: transition.targetRoomId,
        timestamp: Date.now(),
        payload: {
          previousState: previousSession?.state || null,
          nextState: session.state,
          movedUsers: transition.movedUsers,
          targetState: transition.targetState,
          mainRoom: {
            id: transition.mainRoomId,
            name: transition.mainRoomName,
            roomType: RoomType.MAIN,
          },
          greenRoom: {
            id: transition.greenRoomId,
            name: transition.greenRoomName,
            roomType: RoomType.GROUP,
          },
          targetRoomId: transition.targetRoomId,
          targetRoomName: transition.targetRoomName,
          users: transition.users.map((member) => ({
            userId: member.id,
            username: member.username,
            roomId: member.roomId,
            roomName: member.roomName,
            previousGroupId: member.previousGroupId || null,
          })),
        },
      })

      wsManager.broadcastEventToSession(session.id, {
        id: crypto.randomUUID() as UUID,
        type: 'SESSION:STATE_CHANGED',
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: session.id,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          state: session.state,
        },
      })

      wsManager.broadcastEventToSession(session.id, {
        id: crypto.randomUUID() as UUID,
        type: SESSION_EVENT_TYPES.COOLDOWN_ENDED,
        version: 1,
        userId: user.userId as UUID,
        userRole: user.role,
        sessionId: session.id,
        roomId: null,
        timestamp: Date.now(),
        payload: {
          state: session.state,
          endedBy: user.userId,
          endedAt: Date.now(),
        },
      })
    }

    if (session.state === SessionStateEnum.ENDED || session.state === SessionStateEnum.CLEANUP) {
      clearSessionRecoveryState(session.id)
    }

    await appendSessionAuditEvent({
      sessionId: session.id,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'SESSION_COOLDOWN_ENDED',
      targetType: 'SESSION',
      targetId: session.id,
      roomId: transition.targetRoomId,
      visibilityClass: 'SYSTEM',
      metadata: {
        previousState: previousSession?.state || null,
        nextState: session.state,
        movedUsersCount: transition.movedUsers,
      },
    })

    // Emit SESSION_ENDED boundary to main room + greenroom now that the session is fully ENDED.
    const endedBoundaryRoomIds = [transition.mainRoomId, transition.greenRoomId].filter(
      Boolean
    ) as UUID[]
    await emitSessionBoundarySystemMessage({
      sessionId: session.id,
      roomIds: endedBoundaryRoomIds,
      sessionName: session.name,
      boundaryType: 'SESSION_ENDED',
      dmId: user.userId as UUID,
      dmUsername: user.username,
      wsManager: req.app.locals.wsManager,
    })

    await logSessionStateChange(
      session.id,
      user.userId as UUID,
      user.username,
      previousSession?.state || 'UNKNOWN',
      toPublicSessionState(session.state) ?? session.state
    )

    sessionCleanupJobService.notifyLifecycleTrigger('SESSION_ENDED')

    await broadcastLobbyStatsUpdated(user.userId as UUID, user.role as Role)
    await broadcastCampaignListInvalidatedForSession({
      sessionId: session.id,
      actorUserId: user.userId as UUID,
      actorUserRole: user.role as Role,
      reason: 'SESSION_COOLDOWN_ENDED',
    })

    return res.status(200).json({ session })
  } catch (err: any) {
    if (err.code === ErrorCode.INVALID_STATE_TRANSITION) {
      return res.status(409).json(err)
    }
    if (err.code === ErrorCode.FORBIDDEN) {
      return res.status(403).json(err)
    }
    return internalErrorResponse(res)
  }
})

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { id } = req.params
  const { name, description, plannedDurationMinutes } = req.body || {}

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  if (name !== undefined && !isValidSessionName(name)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid session name',
      field: 'name',
    })
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'description must be a string or null',
      field: 'description',
    })
  }

  if (
    plannedDurationMinutes !== undefined &&
    plannedDurationMinutes !== null &&
    (!Number.isInteger(plannedDurationMinutes) ||
      plannedDurationMinutes < 15 ||
      plannedDurationMinutes > 720)
  ) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'plannedDurationMinutes must be an integer between 15 and 720',
      field: 'plannedDurationMinutes',
    })
  }

  try {
    const session = await updateSessionMetadata(
      id as UUID,
      {
        name: typeof name === 'string' ? name.trim() : undefined,
        description:
          description === null
            ? null
            : typeof description === 'string'
              ? description.trim() || null
              : undefined,
        plannedDurationMinutes:
          plannedDurationMinutes === null
            ? null
            : Number.isInteger(plannedDurationMinutes)
              ? plannedDurationMinutes
              : undefined,
      },
      user.userId as UUID
    )

    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    return res.status(200).json({ session })
  } catch (error) {
    if ((error as { code?: string }).code === ErrorCode.FORBIDDEN) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'Only DM can update session metadata',
      })
    }

    return internalErrorResponse(res)
  }
})

/**
 * POST /api/session/:id/join
 * Add a user to a session
 * New player joins are gated by the campaign late-join policy once the grace window expires.
 */
router.post('/:id/join', requireAuth, joinSessionHandler)
router.post('/:id/members/join', requireAuth, joinSessionHandler)

/**
 * POST /api/session/:id/leave
 * Remove a user from a session
 */
router.post('/:id/leave', requireAuth, leaveSessionHandler)
router.post('/:id/members/leave', requireAuth, leaveSessionHandler)

/**
 * DELETE /api/session/:id
 * Delete a session (session-owner operation)
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { id } = req.params

  if (!isValidUUID(id)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_SESSION,
      message: 'Invalid session ID',
      field: 'id',
    })
  }

  try {
    const session = await getSession(id as UUID)
    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    const deleted = await deleteSession(id as UUID, user.userId)
    if (!deleted) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    await appendSessionAuditEvent({
      sessionId: id as UUID,
      actorUserId: user.userId as UUID,
      actorRole: user.role,
      actionType: 'SESSION_DELETED',
      targetType: 'SESSION',
      targetId: id as UUID,
      visibilityClass: 'SYSTEM',
      metadata: {
        previousState: session.state,
      },
    })

    res.status(204).send()
  } catch (err: any) {
    if (err.code === ErrorCode.FORBIDDEN) {
      return res.status(403).json(err)
    }
    return internalErrorResponse(res)
  }
})

export default router
