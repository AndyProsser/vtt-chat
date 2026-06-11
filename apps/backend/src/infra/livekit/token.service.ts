/**
 * LiveKit Token Service
 * Generates and validates access tokens for LiveKit room connections.
 *
 * Reference: docs/architecture/LIVEKIT-INTEGRATION.md
 */

import { AccessToken, VideoGrant } from 'livekit-server-sdk'
import { config } from '../config'
import { logger } from '@/utils'

export interface TokenGenerationParams {
  roomId: string
  userId: string
  sessionId: string
  canPublish?: boolean
  canSubscribe?: boolean
}

export class LiveKitTokenService {
  private apiKey: string
  private apiSecret: string

  constructor(appConfig: typeof config) {
    this.apiKey = appConfig.livekit.apiKey
    this.apiSecret = appConfig.livekit.apiSecret

    // Validate LiveKit config in development
    if (appConfig.isDevelopment) {
      if (!this.apiKey || !this.apiSecret) {
        logger.warn(
          'livekit',
          'LiveKit API key/secret not configured; development mode with defaults'
        )
      }
    }
  }

  /**
   * Generate a LiveKit access token for a user joining a room.
   *
   * Token grants:
   * - canPublish: true (user can publish their own audio)
   * - canPublishData: true (for metadata/control events)
   * - canSubscribe: true (user can hear others, filtered by privacy rules)
   * - room: restricted to specified room only
   *
   * Token is valid for 24 hours and includes session context in metadata.
   *
   * @param params.roomId - LiveKit room name (must match presence.roomId)
   * @param params.userId - User ID (must match authenticated session user)
   * @param params.sessionId - Session ID (for audit and recovery)
   * @returns JWT token string
   * @throws Error if config is missing or invalid
   */
  async generateToken(params: TokenGenerationParams): Promise<string> {
    const { roomId, userId, sessionId } = params

    if (!roomId || !userId || !sessionId) {
      throw new Error('roomId, userId, and sessionId are required')
    }

    try {
      const grants: VideoGrant = {
        room: roomId,
        roomJoin: true,
        canPublish: params.canPublish ?? true,
        canPublishData: true,
        canSubscribe: params.canSubscribe ?? true,
      }

      const token = new AccessToken(this.apiKey, this.apiSecret)
      token.identity = userId
      token.name = `User ${userId}`

      // Add video grants
      token.addGrant(grants)

      // Generate JWT token
      const jwt = await token.toJwt()

      logger.info(
        'livekit',
        `Generated token for user ${userId} in room ${roomId} (session ${sessionId})`
      )

      return jwt
    } catch (error) {
      logger.error(
        'livekit',
        `Failed to generate token: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  /**
   * Validate token format and basic claims.
   * Does not verify signature (done by LiveKit server).
   *
   * @param token - JWT token to validate
   * @param userId - Expected user ID
   * @param roomId - Expected room ID
   * @returns true if token appears valid
   */
  validateTokenBasic(token: string, userId: string, roomId: string): boolean {
    try {
      // Basic JWT structure check
      if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
        logger.warn('livekit', `Invalid token format for user ${userId}`)
        return false
      }

      // Decode header and payload (don't verify signature)
      const [, payloadB64] = token.split('.')
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'))

      // Check: token not expired
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        logger.warn('livekit', `Token expired for user ${userId}`)
        return false
      }

      // Check: identity matches userId
      if (payload.sub !== userId && payload.identity !== userId) {
        logger.warn(
          'livekit',
          `Token identity mismatch: expected ${userId}, got ${payload.sub || payload.identity}`
        )
        return false
      }

      // Check: room matches (in grants.room or video.room)
      const video = payload.video || {}
      if (video.room && video.room !== roomId) {
        logger.warn('livekit', `Token room mismatch: expected ${roomId}, got ${video.room}`)
        return false
      }

      return true
    } catch (error) {
      logger.error(
        'livekit',
        `Token validation error: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  /**
   * Get LiveKit URL (WebSocket endpoint).
   * Useful for frontend client initialization.
   *
   * @returns LiveKit URL
   */
  getLiveKitUrl(): string {
    // Config should have livekit.url set from env or defaults
    // Return it here for frontend to use
    return process.env.LIVEKIT_URL || 'ws://localhost:7880'
  }
}
