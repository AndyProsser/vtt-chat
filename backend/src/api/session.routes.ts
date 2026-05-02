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
import { ErrorCode, Role } from '@shared'
import type { UUID, SessionState } from '@shared'
import { emitSessionBoundarySystemMessage } from '@/services/system-messages.service'
import { applySessionStateRoomTransition } from '@/services/room.service'
import {
  logSessionJoin,
  logSessionLeave,
  logSessionStateChange,
} from '@/services/session-logs.service'
import {
  listSessionLogsForRequester,
  listSessionUsersForRequester,
} from '@/services/session-access.service'
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
router.get('/:id/users', requireAuth, async (req: Request, res: Response) => {
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
})

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
 * DM-only operation.
 */
router.put('/:id/state', requireAuth, requireDM, async (req: Request, res: Response) => {
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
router.post('/:id/join', requireAuth, async (req: Request, res: Response) => {
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

    // Check if user is already in session
    const currentUsers = await getSessionUsers(id as UUID)
    const alreadyMember = currentUsers.some((u) => u.id === user.userId)
    if (alreadyMember) {
      return res.status(409).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'User is already a member of this session',
      })
    }

    // Add user to session
    const success = await addUserToSession(id as UUID, {
      id: user.userId as UUID,
      username: user.username,
      role: user.role,
      createdAt: Date.now(),
    })

    if (!success) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
    }

    // Log the join event
    await logSessionJoin(id as UUID, user.userId as UUID, user.username)

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      // Broadcast a system message that user joined
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
    res.status(200).json({
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
})

/**
 * POST /api/session/:id/leave
 * Remove a user from a session
 */
router.post('/:id/leave', requireAuth, async (req: Request, res: Response) => {
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

    // Check if DM is trying to leave (not allowed)
    if (session.dmId === (user.userId as UUID)) {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'DM cannot leave their own session',
      })
    }

    // Check if user is in session
    const currentUsers = await getSessionUsers(id as UUID)
    const isMember = currentUsers.some((u) => u.id === user.userId)
    if (!isMember) {
      return res.status(404).json({
        code: ErrorCode.INVALID_INPUT,
        message: 'User is not a member of this session',
      })
    }

    // Remove user from session
    const removal = await removeUserFromSession(id as UUID, user.userId as UUID)

    if (!removal.removed) {
      return res.status(500).json({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to remove user from session',
      })
    }

    // Log the leave event
    await logSessionLeave(id as UUID, user.userId as UUID, user.username)

    const wsManager: WebSocketManager | undefined = req.app.locals.wsManager
    if (wsManager) {
      // Broadcast a system message that user left
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
    res.status(200).json({
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
})

/**
 * DELETE /api/session/:id
 * Delete a session (DM-only)
 */
router.delete('/:id', requireAuth, requireDM, async (req: Request, res: Response) => {
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
