/**
 * LiveKit Routes
 * Token issuance and room management for audio/video.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { getSession, isUserInSession } from '@/services/session.service'
import { LiveKitTokenService } from '@/infra/livekit/token.service'
import { config } from '@/infra/config'
import { ErrorCode, isValidUUID } from '@shared'
import { logger } from '@/utils'

const router = Router()
const tokenService = new LiveKitTokenService(config)

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

/**
 * POST /api/livekit/token
 * Issue a LiveKit access token for a user to join a session's room.
 *
 * Request body:
 * {
 *   sessionId: UUID,
 *   roomId: UUID
 * }
 *
 * Response:
 * {
 *   token: string,           // JWT access token
 *   url: string,             // LiveKit server WebSocket URL
 *   roomName: string,        // Room name for client
 *   userId: UUID,
 *   userName: string
 * }
 */
router.post('/token', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user
  const { sessionId, roomId } = req.body

  // Validate input
  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  if (!isValidUUID(roomId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid roomId',
      field: 'roomId',
    })
  }

  try {
    // Verify user is in the session
    const session = await getSession(sessionId)
    if (!session) {
      return res.status(404).json({
        code: ErrorCode.NOT_FOUND,
        message: 'Session not found',
      })
    }

    // Check if user is authorized to access this session
    const userInSession = await isUserInSession(sessionId, user.userId)
    if (!userInSession && user.role !== 'ADMIN') {
      return res.status(403).json({
        code: ErrorCode.FORBIDDEN,
        message: 'User is not in this session',
      })
    }

    // Generate LiveKit token
    const token = await tokenService.generateToken({
      roomId,
      userId: user.userId,
      sessionId,
    })
    const url = config.livekit.url

    logger.info(
      'livekit',
      `Token issued for user ${user.userId} to room ${roomId} in session ${sessionId}`
    )

    res.status(200).json({
      token,
      url,
      roomName: roomId,
      userId: user.userId,
      userName: user.username,
    })
  } catch (error) {
    logger.error(
      'livekit',
      `Error issuing token: ${error instanceof Error ? error.message : String(error)}`
    )

    return res.status(500).json({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to issue token',
    })
  }
})

/**
 * GET /api/livekit/health
 * Check LiveKit server connectivity
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const url = config.livekit.url
    // Basic connectivity check - in production, call actual LiveKit API health endpoint
    if (url) {
      return res.status(200).json({
        status: 'healthy',
        url,
      })
    }

    return res.status(503).json({
      status: 'unavailable',
      message: 'LiveKit configuration missing',
    })
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
