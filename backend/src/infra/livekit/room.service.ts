/**
 * LiveKit Room Service
 * Server-side room management: muting/unmuting participants mid-session.
 * Used for SILENCED condition enforcement without requiring the client to reconnect.
 */

import { RoomServiceClient } from 'livekit-server-sdk'
import { config } from '../config'
import { logger } from '@/utils'

let client: RoomServiceClient | null = null

function getLiveKitRoomServiceClient(): RoomServiceClient {
  if (!client) {
    const httpUrl = config.livekit.url.replace(/^wss?:\/\//, (m) =>
      m.startsWith('wss') ? 'https://' : 'http://'
    )
    client = new RoomServiceClient(httpUrl, config.livekit.apiKey, config.livekit.apiSecret)
  }
  return client
}

/**
 * Update a participant's publish permission in a LiveKit room.
 * Best-effort — logs and swallows errors so the calling route always succeeds.
 * The participant must already be connected; if not in the room this is a no-op.
 */
export async function enforceParticipantPublishPermission(params: {
  livekitRoomName: string
  userId: string
  canPublish: boolean
}): Promise<void> {
  try {
    const svc = getLiveKitRoomServiceClient()
    await svc.updateParticipant(params.livekitRoomName, params.userId, undefined, {
      canPublish: params.canPublish,
      canPublishData: true,
      canSubscribe: true,
    })
    logger.info(
      'livekit',
      `Set canPublish=${params.canPublish} for ${params.userId} in room ${params.livekitRoomName}`
    )
  } catch (err) {
    logger.warn('livekit', 'Failed to update participant publish permission', {
      livekitRoomName: params.livekitRoomName,
      userId: params.userId,
      canPublish: params.canPublish,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
