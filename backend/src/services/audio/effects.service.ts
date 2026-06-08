import type { UUID } from '@shared'
import type { AudioBroadcastState, AudioDMOverrideState } from '@/types/audio.types'
import { getRedisClient } from '@/infra/redis'
import { AUDIO_BROADCAST_OVERRIDE_TYPE, AUDIO_DM_OVERRIDE_TYPES } from '@/constants/audio.constants'
import {
  listAudioDMOverridesBySession,
  removeAudioDMOverridesBySession,
  removeAudioDMOverrideRecord,
  upsertAudioDMOverrideRecord,
} from '@/repositories/audio.repository'
import { getPrismaClient } from '@/infra/db'
import { logger } from '@/utils'

const prisma = getPrismaClient()

function audioOverridesHashKey(sessionId: UUID): string {
  return `audio:session:${sessionId}:overrides`
}

function audioOverrideField(targetUserId: UUID, overrideType: string): string {
  return `${targetUserId}:${overrideType}`
}

export { AUDIO_BROADCAST_OVERRIDE_TYPE }

export interface ServerMuteEnforcementState {
  userMuted: boolean
  dmMuted: boolean
  /** True when the player has the Silenced condition applied by the DM. */
  silenced: boolean
  enforcedMuted: boolean
}

export function getBroadcastRoomId(sessionId: UUID): string {
  return `dm-broadcast:${sessionId}`
}

export async function applyDMOverrideState(params: {
  sessionId: UUID
  targetUserId: UUID
  overrideType: string
  parameters?: Record<string, unknown>
  appliedBy: UUID
  appliedAt?: number
}): Promise<AudioDMOverrideState> {
  const appliedAt = params.appliedAt ?? Date.now()

  await upsertAudioDMOverrideRecord({
    sessionId: params.sessionId,
    targetUserId: params.targetUserId,
    overrideType: params.overrideType,
    parameters: params.parameters || {},
    appliedBy: params.appliedBy,
    appliedAt: new Date(appliedAt),
  })

  try {
    const redis = await getRedisClient()
    const payload: AudioDMOverrideState = {
      targetUserId: params.targetUserId,
      overrideType: params.overrideType,
      parameters: params.parameters || {},
      appliedBy: params.appliedBy,
      appliedAt,
    }

    await redis.hSet(
      audioOverridesHashKey(params.sessionId),
      audioOverrideField(params.targetUserId, params.overrideType),
      JSON.stringify(payload)
    )
  } catch (error) {
    logger.warn('audio', 'Failed to mirror DM override in Redis', {
      sessionId: params.sessionId,
      targetUserId: params.targetUserId,
      overrideType: params.overrideType,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    targetUserId: params.targetUserId,
    overrideType: params.overrideType,
    parameters: params.parameters || {},
    appliedBy: params.appliedBy,
    appliedAt,
  }
}

export async function removeDMOverrideState(params: {
  sessionId: UUID
  targetUserId: UUID
  overrideType: string
}): Promise<boolean> {
  const deleted = await removeAudioDMOverrideRecord({
    sessionId: params.sessionId,
    targetUserId: params.targetUserId,
    overrideType: params.overrideType,
  })

  try {
    const redis = await getRedisClient()
    await redis.hDel(
      audioOverridesHashKey(params.sessionId),
      audioOverrideField(params.targetUserId, params.overrideType)
    )
  } catch (error) {
    logger.warn('audio', 'Failed to remove DM override from Redis mirror', {
      sessionId: params.sessionId,
      targetUserId: params.targetUserId,
      overrideType: params.overrideType,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return deleted > 0
}

export async function clearSessionDMOverrideState(sessionId: UUID): Promise<void> {
  await removeAudioDMOverridesBySession(sessionId)

  try {
    const redis = await getRedisClient()
    await redis.del(audioOverridesHashKey(sessionId))
  } catch (error) {
    logger.warn('audio', 'Failed to clear DM override Redis mirror', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function setBroadcastState(params: {
  sessionId: UUID
  dmId: UUID
  enabled: boolean
  changedAt?: number
}): Promise<AudioBroadcastState> {
  const changedAt = params.changedAt ?? Date.now()

  if (params.enabled) {
    await upsertAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: AUDIO_BROADCAST_OVERRIDE_TYPE,
      parameters: { enabled: true, broadcastRoomId: getBroadcastRoomId(params.sessionId) },
      appliedBy: params.dmId,
      appliedAt: new Date(changedAt),
    })

    try {
      const redis = await getRedisClient()
      const payload: AudioDMOverrideState = {
        targetUserId: params.dmId,
        overrideType: AUDIO_BROADCAST_OVERRIDE_TYPE,
        parameters: { enabled: true, broadcastRoomId: getBroadcastRoomId(params.sessionId) },
        appliedBy: params.dmId,
        appliedAt: changedAt,
      }

      await redis.hSet(
        audioOverridesHashKey(params.sessionId),
        audioOverrideField(params.dmId, AUDIO_BROADCAST_OVERRIDE_TYPE),
        JSON.stringify(payload)
      )
    } catch (error) {
      logger.warn('audio', 'Failed to mirror broadcast state in Redis', {
        sessionId: params.sessionId,
        dmId: params.dmId,
        enabled: params.enabled,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    await removeAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: AUDIO_BROADCAST_OVERRIDE_TYPE,
    })

    try {
      const redis = await getRedisClient()
      await redis.hDel(
        audioOverridesHashKey(params.sessionId),
        audioOverrideField(params.dmId, AUDIO_BROADCAST_OVERRIDE_TYPE)
      )
    } catch (error) {
      logger.warn('audio', 'Failed to clear broadcast state in Redis mirror', {
        sessionId: params.sessionId,
        dmId: params.dmId,
        enabled: params.enabled,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    enabled: params.enabled,
    dmId: params.dmId,
    broadcastRoomId: getBroadcastRoomId(params.sessionId),
    changedAt,
  }
}

/** @deprecated Use setBroadcastState */
export const setVoiceOfGodState = setBroadcastState

/**
 * Set user's own mute state in presence (Redis-first).
 * When user mutes/unmutes themselves, this updates their presence record.
 */
export async function setUserMuteState(params: {
  sessionId: UUID
  userId: UUID
  muted: boolean
  mutedAt?: number
}): Promise<{ userId: UUID; sessionId: UUID; userMuted: boolean; mutedAt: number }> {
  const redis = await getRedisClient()
  const presenceHashKey = `presence:session:${params.sessionId}`
  const userMuted = params.muted
  const mutedAt = params.mutedAt ?? Date.now()

  // Get current presence record from Redis
  const presenceJson = await redis.hGet(presenceHashKey, params.userId)
  if (!presenceJson) {
    // User doesn't have a presence record yet; create minimal one with mute state
    const minimalPresence = {
      userId: params.userId,
      sessionId: params.sessionId,
      username: params.userId,
      state: 'ONLINE',
      userMuted,
      lastSeenAt: mutedAt,
    }
    await redis.hSet(presenceHashKey, params.userId, JSON.stringify(minimalPresence))
  } else {
    // Update existing presence record with new mute state
    const presence = JSON.parse(presenceJson) as any
    presence.userMuted = userMuted
    presence.lastSeenAt = mutedAt
    await redis.hSet(presenceHashKey, params.userId, JSON.stringify(presence))
  }

  return {
    userId: params.userId,
    sessionId: params.sessionId,
    userMuted,
    mutedAt,
  }
}

/**
 * Authoritative backend mute gate used by LiveKit token issuance.
 * If this returns enforcedMuted=true, token issuance should set canPublish=false.
 */
export async function getServerMuteEnforcementState(params: {
  sessionId: UUID
  userId: UUID
}): Promise<ServerMuteEnforcementState> {
  const redis = await getRedisClient()
  const presenceHashKey = `presence:session:${params.sessionId}`

  const presenceJson = await redis.hGet(presenceHashKey, params.userId)

  let userMuted = false
  if (presenceJson) {
    try {
      const parsed = JSON.parse(presenceJson) as { userMuted?: unknown }
      userMuted = parsed.userMuted === true
    } catch {
      userMuted = false
    }
  }

  const overrides = await listAudioDMOverridesBySession(params.sessionId)
  const userOverrides = overrides.filter((row) => row.targetUserId === params.userId)

  const latestMuteIntent = userOverrides.find(
    (row) =>
      row.overrideType === AUDIO_DM_OVERRIDE_TYPES.MUTE ||
      row.overrideType === AUDIO_DM_OVERRIDE_TYPES.UNMUTE
  )
  const dmMuted = latestMuteIntent?.overrideType === AUDIO_DM_OVERRIDE_TYPES.MUTE

  // SILENCED condition prevents publishing to the room (others cannot hear the player).
  const conditionOverride = userOverrides.find((row) => row.overrideType === 'CONDITION')
  const conditionName =
    typeof (conditionOverride?.parameters as Record<string, unknown>)?.conditionName === 'string'
      ? (conditionOverride!.parameters as Record<string, unknown>).conditionName
      : typeof (conditionOverride?.parameters as Record<string, unknown>)?.presetName === 'string'
        ? (conditionOverride!.parameters as Record<string, unknown>).presetName
        : null
  const silenced = conditionName === 'Silenced'

  return {
    userMuted,
    dmMuted,
    silenced,
    enforcedMuted: userMuted || dmMuted || silenced,
  }
}

export type DmVoiceModeValue = 'TARGET_GROUP' | 'BROADCAST'

export interface DmVoiceModeState {
  dmId: UUID
  voiceMode: DmVoiceModeValue
  targetGroupId: UUID | null
  backgroundVolume: number
  changedAt: number
}

/**
 * Set DM voice mode and background volume.
 * Persists the preference to the User record (cross-device).
 * When switching to BROADCAST, also activates the broadcast override record.
 * When switching to TARGET_GROUP, deactivates the broadcast override record.
 */
export async function setDmVoiceMode(params: {
  sessionId: UUID
  dmId: UUID
  voiceMode: DmVoiceModeValue
  targetGroupId?: UUID | null
  backgroundVolume?: number
  changedAt?: number
}): Promise<DmVoiceModeState> {
  const changedAt = params.changedAt ?? Date.now()
  const backgroundVolume = params.backgroundVolume ?? 0.3

  await prisma.user.update({
    where: { id: params.dmId },
    data: {
      dmVoiceMode: params.voiceMode,
      dmBackgroundVolume: backgroundVolume,
    },
  })

  if (params.voiceMode === 'BROADCAST') {
    await upsertAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: AUDIO_BROADCAST_OVERRIDE_TYPE,
      parameters: {
        enabled: true,
        broadcastRoomId: getBroadcastRoomId(params.sessionId),
        backgroundVolume,
      },
      appliedBy: params.dmId,
      appliedAt: new Date(changedAt),
    })

    try {
      const redis = await getRedisClient()
      const payload: AudioDMOverrideState = {
        targetUserId: params.dmId,
        overrideType: AUDIO_BROADCAST_OVERRIDE_TYPE,
        parameters: {
          enabled: true,
          broadcastRoomId: getBroadcastRoomId(params.sessionId),
          backgroundVolume,
        },
        appliedBy: params.dmId,
        appliedAt: changedAt,
      }

      await redis.hSet(
        audioOverridesHashKey(params.sessionId),
        audioOverrideField(params.dmId, AUDIO_BROADCAST_OVERRIDE_TYPE),
        JSON.stringify(payload)
      )
    } catch (error) {
      logger.warn('audio', 'Failed to mirror DM voice broadcast mode in Redis', {
        sessionId: params.sessionId,
        dmId: params.dmId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  } else {
    await removeAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: AUDIO_BROADCAST_OVERRIDE_TYPE,
    })

    try {
      const redis = await getRedisClient()
      await redis.hDel(
        audioOverridesHashKey(params.sessionId),
        audioOverrideField(params.dmId, AUDIO_BROADCAST_OVERRIDE_TYPE)
      )
    } catch (error) {
      logger.warn('audio', 'Failed to clear DM voice broadcast mode in Redis', {
        sessionId: params.sessionId,
        dmId: params.dmId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    dmId: params.dmId,
    voiceMode: params.voiceMode,
    targetGroupId: params.targetGroupId ?? null,
    backgroundVolume,
    changedAt,
  }
}
