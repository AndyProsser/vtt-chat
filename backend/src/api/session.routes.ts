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
} from '@/services/system-messages.service'
import {
  applySessionStateRoomTransition,
  deletePrivateRoomsForEndedSession,
  ensureSessionDefaultRoomsForSession,
  ensureSessionWhisperRoomForSession,
  getRooms,
  getSessionPresence,
  joinRoom,
} from '@/services/room.service'
import {
  clearRoomEnvironmentState,
  clearSessionDMOverrideState,
  getSessionAudioState,
} from '@/services/audio/audio-state'
import { clearRoomMessages } from '@/services/chat.service'
import {
  countSessionCooldownExtensions,
  logSessionCooldownExtended,
  logSessionJoin,
  logSessionLeave,
  logSessionStateChange,
} from '@/services/session/logs.service'
import {
  listSessionLogsForRequester,
  listSessionUsersForRequester,
} from '@/services/session/access.service'
import { resolveRoleForSessionJoin } from '@/services/session/authz.service'
import { broadcastSessionStatsSnapshot } from '@/services/session/stats.service'
import { resolveCooldownControlAuthorization } from '@/services/session/cooldown-authz.service'
import {
  isSessionActiveOrPaused,
  SESSION_COOLDOWN_EXTENSION_MAX_MS,
  SESSION_COOLDOWN_EXTENSION_MIN_MS,
  SESSION_COOLDOWN_EXTENSION_STEP_MS,
  STANDALONE_SESSION_COOLDOWN_MS,
} from '@/constants/session.constants'
import { SESSION_EVENT_TYPES } from '@/constants/session-events.constants'
import type { WebSocketManager } from '@/ws'

const router = Router()
const prisma = getPrismaClient()

async function getEffectiveCooldownDurationMs(sessionId: UUID): Promise<number> {
  const result = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      campaign: {
        select: {
          postSessionChatDurationMs: true,
        },
      },
    },
  })

  const configured = result?.campaign?.postSessionChatDurationMs ?? STANDALONE_SESSION_COOLDOWN_MS
  const clamped = Math.max(
    SESSION_COOLDOWN_EXTENSION_MIN_MS,
    Math.min(SESSION_COOLDOWN_EXTENSION_MAX_MS, configured)
  )

  return clamped
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
  boundaryType: 'SESSION_STARTED' | 'SESSION_PAUSED' | 'SESSION_RESUMED' | 'SESSION_ENDED'
  mainRoomId: UUID
  greenRoomId: UUID
}): UUID[] {
  if (params.boundaryType === 'SESSION_STARTED' || params.boundaryType === 'SESSION_ENDED') {
    return Array.from(new Set([params.mainRoomId, params.greenRoomId]))
  }

  return [params.mainRoomId]
}

async function ensureJoinedMemberPresence(params: {
  session: Awaited<ReturnType<typeof getSession>>
  userId: UUID
  username: string
}): Promise<{ changed: boolean; roomId?: UUID; state?: PresenceState; previousGroupId?: UUID }> {
  if (!params.session) {
    return { changed: false }
  }

  await ensureSessionDefaultRoomsForSession(params.session.id, params.session.dmId)

  const rooms = await getRooms(params.session.id)
  const mainRoom =
    rooms.find((room) => room.type === RoomType.MAIN) ||
    rooms.find((room) => normalizeRoomName(room.name) === 'main room')
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

  const targetState =
    params.session.state === 'ENDED'
      ? PresenceState.OFFLINE
      : shouldUseMain
        ? PresenceState.ONLINE
        : PresenceState.IDLE

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

    if (session.state === SessionStateEnum.CLEANUP && session.dmId === (user.userId as UUID)) {
      const restoredSession = await updateSessionState(
        id as UUID,
        SessionStateEnum.IDLE,
        session.dmId
      )

      if (restoredSession) {
        session = restoredSession
      }
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

    const ensured = await ensureJoinedMemberPresence({
      session,
      userId: user.userId as UUID,
      username: user.username,
    })

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      if (ensured.changed && ensured.roomId && ensured.state) {
        const timestamp = Date.now()
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
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'DM cannot leave their own session',
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

    const removal = await removeUserFromSession(id as UUID, user.userId as UUID)

    if (!removal.removed) {
      return res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to remove user from session',
      })
    }

    await logSessionLeave(id as UUID, user.userId as UUID, user.username)

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
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

    const users = await getSessionUsers(id as UUID)
    res.status(200).json({
      ...session,
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

    const users = await getSessionUsers(id as UUID)
    const transition = await applySessionStateRoomTransition({
      sessionId: session.id,
      dmId: session.dmId,
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

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager

    const movedToGreenRoom = transition.targetRoomId === transition.greenRoomId
    const shouldClearGreenRoomContext = movedToGreenRoom && requestedState === 'ENDED'

    if (shouldClearGreenRoomContext) {
      await clearRoomMessages(session.id, transition.greenRoomId)
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
          users: users.map((member) => ({
            userId: member.id,
            username: member.username,
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
            cooldownExpiresAt: cooldownStartedAt + cooldownDurationMs,
          },
        })
      }
    }

    const boundaryType =
      requestedState === 'ACTIVE'
        ? previousSession?.state === 'PAUSED'
          ? 'SESSION_RESUMED'
          : 'SESSION_STARTED'
        : requestedState === 'PAUSED'
          ? 'SESSION_PAUSED'
          : requestedState === 'COOLDOWN'
            ? 'SESSION_ENDED'
            : null

    if (boundaryType) {
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

      // Log the state change
      await logSessionStateChange(
        session.id,
        user.userId as UUID,
        user.username,
        previousSession?.state || 'UNKNOWN',
        toPublicSessionState(requestedState) ?? requestedState
      )

      // Emit a previous-session recap card after SESSION_STARTED (not resume from pause)
      if (boundaryType === 'SESSION_STARTED' && transition.mainRoomId) {
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

    res.status(200).json(session)
  } catch (err: any) {
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
          extensionCount: nextCooldownExtensionCount,
        },
      })
    }

    await logSessionCooldownExtended(
      session.id,
      user.userId as UUID,
      user.username,
      parsedExtensionMs
    )

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

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
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

    await logSessionStateChange(
      session.id,
      user.userId as UUID,
      user.username,
      previousSession?.state || 'UNKNOWN',
      toPublicSessionState(session.state) ?? session.state
    )

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
 * Players can join at any time, including after session has started.
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
    const deleted = await deleteSession(id as UUID, user.userId)
    if (!deleted) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    res.status(204).send()
  } catch (err: any) {
    if (err.code === ErrorCode.FORBIDDEN) {
      return res.status(403).json(err)
    }
    return internalErrorResponse(res)
  }
})

export default router
