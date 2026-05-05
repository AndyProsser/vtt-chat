import type { UUID } from '@shared'
import type {
  AudioDMOverrideState,
  AudioBroadcastState,
  AudioEnvironmentState,
  AudioSessionState,
} from '@/types/audio.types'
import {
  listAudioDMOverridesBySession,
  listAudioRoomStateBySession,
  removeAudioDMOverrideRecord,
  upsertAudioDMOverrideRecord,
  upsertAudioRoomStateRecord,
} from '@/repositories/audio.repository'

const BROADCAST_OVERRIDE = 'VOICE_OF_GOD'

export function getBroadcastRoomId(sessionId: UUID): string {
  return `dm-broadcast:${sessionId}`
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

export async function setRoomEnvironmentState(params: {
  sessionId: UUID
  roomId: UUID
  environmentName: string
  environmentId: string
  parameters?: Record<string, unknown>
  setBy: UUID
  setAt?: number
}): Promise<AudioEnvironmentState> {
  const setAt = params.setAt ?? Date.now()

  await upsertAudioRoomStateRecord({
    sessionId: params.sessionId,
    roomId: params.roomId,
    environmentName: params.environmentName,
    environmentId: params.environmentId,
    parameters: params.parameters || {},
    setBy: params.setBy,
    setAt: new Date(setAt),
  })

  return {
    roomId: params.roomId,
    environmentName: params.environmentName,
    environmentId: params.environmentId,
    parameters: params.parameters || {},
    setBy: params.setBy,
    setAt,
  }
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

export async function getSessionAudioState(sessionId: UUID): Promise<AudioSessionState> {
  const [environments, dmOverrides] = await Promise.all([
    listAudioRoomStateBySession(sessionId),
    listAudioDMOverridesBySession(sessionId),
  ])

  const broadcastRow = dmOverrides.find((row) => row.overrideType === BROADCAST_OVERRIDE)
  const broadcast: AudioBroadcastState = {
    enabled: Boolean(broadcastRow),
    dmId: broadcastRow ? (broadcastRow.targetUserId as UUID) : undefined,
    broadcastRoomId: getBroadcastRoomId(sessionId),
    changedAt: broadcastRow?.appliedAt?.getTime(),
  }

  return {
    sessionId,
    environments: environments.map((row) => ({
      roomId: row.roomId as UUID,
      environmentName: row.environmentName,
      environmentId: row.environmentId,
      parameters: toRecord(row.parameters),
      setBy: row.setBy as UUID,
      setAt: row.setAt.getTime(),
    })),
    dmOverrides: dmOverrides
      .filter((row) => row.overrideType !== BROADCAST_OVERRIDE)
      .map((row) => ({
        targetUserId: row.targetUserId as UUID,
        overrideType: row.overrideType,
        parameters: toRecord(row.parameters),
        appliedBy: row.appliedBy as UUID,
        appliedAt: row.appliedAt.getTime(),
      })),
    broadcast,
    // Backward compatibility for existing clients.
    voiceOfGod: broadcast,
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
      overrideType: BROADCAST_OVERRIDE,
      parameters: { enabled: true, broadcastRoomId: getBroadcastRoomId(params.sessionId) },
      appliedBy: params.dmId,
      appliedAt: new Date(changedAt),
    })
  } else {
    await removeAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: BROADCAST_OVERRIDE,
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
