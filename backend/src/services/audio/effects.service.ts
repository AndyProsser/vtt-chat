import type { UUID } from '@shared'
import type { AudioBroadcastState, AudioDMOverrideState } from '@/types/audio.types'
import {
  removeAudioDMOverrideRecord,
  upsertAudioDMOverrideRecord,
} from '@/repositories/audio.repository'

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
