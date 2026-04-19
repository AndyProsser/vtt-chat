/**
 * Session Routes (formerly Campaign Routes)
 * CRUD operations for game sessions.
 * Stage 1: In-memory store; later stages add persistence.
 */

import { Router, Request, Response, NextFunction } from 'express'
import {
  createSession,
  getSession,
  getAllSessions,
  updateSessionState,
  deleteSession,
  addUserToSession,
  getSessionUsers,
} from '@/services/session.service'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { isValidSessionName, isValidUUID } from '@shared'
import { ErrorCode, createError } from '@shared'
import type { UUID, SessionState } from '@shared'

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
  } catch (err: any) {
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
  } catch (err: any) {
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
  } catch (err: any) {
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
    const session = await updateSessionState(id as UUID, state as SessionState, user.userId)
    if (!session) {
      return res.status(404).json({
        code: ErrorCode.SESSION_NOT_FOUND,
        message: 'Session not found',
      })
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
