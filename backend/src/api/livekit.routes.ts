/**
 * LiveKit Routes
 * Token issuance and room management for audio/video.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { LiveKitTokenService } from '@/infra/livekit/token.service'
import { config } from '@/infra/config'
import { ErrorCode, isValidUUID } from '@shared'
import { logger } from '@/utils'
import { resolveEffectiveSessionRole } from '@/services/session-authz.service'

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
  const { sessionId, roomId, channel } = req.body

  // Validate input
  if (!isValidUUID(sessionId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid sessionId',
      field: 'sessionId',
    })
  }

  const requestedChannel = channel === 'voice_of_god' ? 'voice_of_god' : 'room'

  if (requestedChannel === 'room' && !isValidUUID(roomId)) {
    return res.status(400).json({
      code: ErrorCode.INVALID_INPUT,
      message: 'Invalid roomId',
      field: 'roomId',
    })
  }

  try {
    const authz = await resolveEffectiveSessionRole({
      sessionId,
      userId: user.userId,
      requireMembershipForDm: true,
    })
    if (!authz.ok) {
      return res.status(authz.code === 'SESSION_NOT_FOUND' ? 404 : 403).json({
        code: authz.code === 'SESSION_NOT_FOUND' ? ErrorCode.NOT_FOUND : ErrorCode.FORBIDDEN,
        message: authz.message,
      })
    }

    const isSessionDm = authz.role === 'DM'
    const resolvedRoomId =
      requestedChannel === 'voice_of_god' ? `voice-of-god:${sessionId}` : (roomId as string)

    const canPublish = requestedChannel === 'voice_of_god' ? isSessionDm : true
    const canSubscribe = requestedChannel === 'voice_of_god' ? !isSessionDm : true

    // Generate LiveKit token
    const token = await tokenService.generateToken({
      roomId: resolvedRoomId,
      userId: user.userId,
      sessionId,
      canPublish,
      canSubscribe,
    })
    const url = config.livekit.url

    logger.info(
      'livekit',
      `Token issued for user ${user.userId} to room ${resolvedRoomId} in session ${sessionId}`
    )

    res.status(200).json({
      token,
      url,
      roomName: resolvedRoomId,
      channel: requestedChannel,
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
