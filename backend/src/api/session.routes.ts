/**
 * Session Routes (formerly Campaign Routes)
 * CRUD operations for game sessions.
 * Uses persistent storage for session state.
 */

import { Router, Request, Response, NextFunction } from 'express'
import {
  createSession,
  getSession,
  getAllSessions,
  updateSessionState,
  deleteSession,
  addUserToSession,
  removeUserFromSession,
  getSessionUsers,
} from '@/services/session.service'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { isValidSessionName, isValidUUID } from '@shared'
import { ErrorCode, PresenceState, Role, RoomType } from '@shared'
import type { UUID, SessionState } from '@shared'
import { emitSessionBoundarySystemMessage } from '@/services/system-messages.service'
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
} from '@/services/audio-state.service'
import { clearRoomMessages } from '@/services/chat.service'
import {
  logSessionJoin,
  logSessionLeave,
  logSessionStateChange,
} from '@/services/session-logs.service'
import {
  listSessionLogsForRequester,
  listSessionUsersForRequester,
} from '@/services/session-access.service'
import { resolveRoleForSessionJoin } from '@/services/session-authz.service'
import type { WebSocketManager } from '@/ws'

const router = Router()

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

async function ensureJoinedMemberPresence(params: {
  session: Awaited<ReturnType<typeof getSession>>
  userId: UUID
  username: string
}): Promise<{ changed: boolean; roomId?: UUID; state?: PresenceState }> {
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

  const shouldUseMain = params.session.state === 'ACTIVE' || params.session.state === 'PAUSED'

  if (shouldUseMain) {
    await ensureSessionWhisperRoomForSession(params.session.id, params.session.dmId)
  }

  const targetRoom = shouldUseMain ? mainRoom || greenRoom : greenRoom || mainRoom

  if (!targetRoom) {
    return { changed: false }
  }

  const targetState =
    params.session.state === 'ENDED'
      ? PresenceState.OFFLINE
      : shouldUseMain
        ? PresenceState.ONLINE
        : PresenceState.IDLE

  const currentPresence = (await getSessionPresence(params.session.id)).find(
    (presence) => presence.userId === params.userId
  )

  if (currentPresence?.primaryRoomId === targetRoom.id && currentPresence.state === targetState) {
    return {
      changed: false,
      roomId: targetRoom.id,
      state: targetState,
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
    const session = await getSession(id as UUID)
    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
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
          },
        })
      }

      return res.status(200).json({
        session,
        users: currentUsers.map((u) => ({
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

  if (!state || !['IDLE', 'ACTIVE', 'PAUSED', 'ENDED'].includes(state)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid state',
      field: 'state',
    })
  }

  try {
    const previousSession = await getSession(id as UUID)
    const session = await updateSessionState(id as UUID, state as SessionState, user.userId)
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
      nextState: state as SessionState,
      users: users.map((member) => ({
        id: member.id,
        username: member.username,
      })),
    })

    const audioStateBeforeReset = await getSessionAudioState(session.id)
    await clearSessionDMOverrideState(session.id)

    // Only clear environment for the neutral room (main or greenroom), not other groups
    const neutralRoomId = state === 'ACTIVE' ? transition.mainRoomId : transition.greenRoomId

    await clearRoomEnvironmentState({
      sessionId: session.id,
      roomId: neutralRoomId,
    })

    if (state === 'ENDED') {
      await deletePrivateRoomsForEndedSession(session.id)
    }

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager

    const movedToGreenRoom = transition.targetRoomId === transition.greenRoomId
    const shouldClearGreenRoomContext =
      movedToGreenRoom && (state === 'PAUSED' || state === 'ENDED')

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
          nextState: state,
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
    }

    const boundaryType =
      state === 'ACTIVE'
        ? previousSession?.state === 'PAUSED'
          ? 'SESSION_RESUMED'
          : 'SESSION_STARTED'
        : state === 'PAUSED'
          ? 'SESSION_PAUSED'
          : state === 'ENDED'
            ? 'SESSION_ENDED'
            : null

    if (boundaryType) {
      await emitSessionBoundarySystemMessage({
        sessionId: session.id,
        roomId: transition.mainRoomId,
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
        state
      )
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
