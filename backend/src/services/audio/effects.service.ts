import type { UUID } from '@shared'
import type { AudioBroadcastState, AudioDMOverrideState } from '@/types/audio.types'
import { getRedisClient } from '@/infra/redis'
import {
  removeAudioDMOverridesBySession,
  removeAudioDMOverrideRecord,
  upsertAudioDMOverrideRecord,
} from '@/repositories/audio.repository'
import { getPrismaClient } from '@/infra/db'

const prisma = getPrismaClient()

export const AUDIO_BROADCAST_OVERRIDE_TYPE = 'VOICE_OF_GOD'

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
}): Promise<void> {
  await removeAudioDMOverrideRecord({
    sessionId: params.sessionId,
    targetUserId: params.targetUserId,
    overrideType: params.overrideType,
  })
}

export async function clearSessionDMOverrideState(sessionId: UUID): Promise<void> {
  await removeAudioDMOverridesBySession(sessionId)
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
  } else {
    await removeAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: AUDIO_BROADCAST_OVERRIDE_TYPE,
    })
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
  } else {
    await removeAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: AUDIO_BROADCAST_OVERRIDE_TYPE,
    })
  }

  return {
    dmId: params.dmId,
    voiceMode: params.voiceMode,
    targetGroupId: params.targetGroupId ?? null,
    backgroundVolume,
    changedAt,
  }
}
