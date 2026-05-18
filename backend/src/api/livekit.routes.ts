/**
 * LiveKit Routes
 * Token issuance and room management for audio/video.
 */

import { Router, Request, Response, NextFunction } from 'express'
import { extractTokenFromHeader, verifyToken } from '@/services/auth.service'
import { LiveKitTokenService } from '@/infra/livekit/token.service'
import { config } from '@/infra/config'
import { ErrorCode, isValidUUID, type UUID } from '@shared'
import { logger } from '@/utils'
import { resolveEffectiveSessionRole } from '@/services/session/authz.service'
import { getServerMuteEnforcementState } from '@/services/audio/audio-state'
import { getPrismaClient } from '@/infra/db'
import { Role, SessionState } from '@shared'

const router = Router()
const tokenService = new LiveKitTokenService(config)
const prisma = getPrismaClient()

async function isSpectatorCooldownVoiceEnabled(sessionId: UUID): Promise<boolean> {
  const result = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      campaign: {
        select: {
          postSessionChatEnabled: true,
        },
      },
    },
  })

  return Boolean(result?.campaign?.postSessionChatEnabled)
}

function toWsUrl(input: string): string {
  try {
    const parsed = new URL(input)
    if (parsed.protocol === 'https:' || parsed.protocol === 'wss:') {
      parsed.protocol = 'wss:'
    } else {
      parsed.protocol = 'ws:'
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return input.replace(/\/$/, '')
  }
}

function buildPublicLiveKitUrl(req: Request): string {
  if (config.livekit.publicUrl) {
    return toWsUrl(config.livekit.publicUrl)
  }

  const forwardedHost = req.headers['x-forwarded-host']
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || req.get('host') || ''
  const forwardedProto = req.headers['x-forwarded-proto']
  const proto =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || req.protocol || 'http'

  if (!host) {
    return toWsUrl(config.livekit.url)
  }

  const wsProto = proto === 'https' || proto === 'wss' ? 'wss' : 'ws'
  return `${wsProto}://${host}/livekit`
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

  const requestedChannel =
    channel === 'broadcast' || channel === 'voice_of_god' ? 'broadcast' : 'room'

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
    const isSpectator = authz.role === Role.SPECTATOR

    if (isSpectator) {
      if (authz.session.state === SessionState.ACTIVE) {
        // Observe-only in ACTIVE: spectators can hear but cannot publish voice.
      } else if (authz.session.state === SessionState.COOLDOWN) {
        const postSessionVoiceEnabled = await isSpectatorCooldownVoiceEnabled(sessionId as UUID)
        if (!postSessionVoiceEnabled) {
          return res.status(403).json({
            code: ErrorCode.FORBIDDEN,
            message: 'Spectator voice is disabled for this cooldown window',
          })
        }
      } else {
        return res.status(403).json({
          code: ErrorCode.FORBIDDEN,
          message: `Spectator voice is unavailable while the session is ${authz.session.state}`,
        })
      }
    }

    const resolvedRoomId =
      requestedChannel === 'broadcast' ? `dm-broadcast:${sessionId}` : (roomId as string)

    const muteState = await getServerMuteEnforcementState({
      sessionId: sessionId as UUID,
      userId: user.userId as UUID,
    })

    const publishAllowedByMute = !muteState.enforcedMuted

    const canPublish =
      requestedChannel === 'broadcast'
        ? isSessionDm && publishAllowedByMute
        : isSpectator
          ? authz.session.state === SessionState.COOLDOWN && publishAllowedByMute
          : publishAllowedByMute
    const canSubscribe = requestedChannel === 'broadcast' ? !isSessionDm : true

    // Generate LiveKit token
    const token = await tokenService.generateToken({
      roomId: resolvedRoomId,
      userId: user.userId,
      sessionId,
      canPublish,
      canSubscribe,
    })
    const url = buildPublicLiveKitUrl(req)

    logger.info(
      'livekit',
      `Token issued for user ${user.userId} to room ${resolvedRoomId} in session ${sessionId}`,
      {
        canPublish,
        muteEnforced: muteState.enforcedMuted,
        userMuted: muteState.userMuted,
        dmMuted: muteState.dmMuted,
      }
    )

    res.status(200).json({
      token,
      url,
      roomName: resolvedRoomId,
      channel: requestedChannel,
      canPublish,
      muteEnforced: muteState.enforcedMuted,
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
    const publicUrl = buildPublicLiveKitUrl(req)
    // Basic connectivity check - in production, call actual LiveKit API health endpoint
    if (url) {
      return res.status(200).json({
        status: 'healthy',
        url,
        publicUrl,
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
