import type { UUID } from '@shared'
import type {
  AudioBroadcastState,
  AudioEnvironmentState,
  AudioSessionState,
} from '@/types/audio.types'
import {
  listAudioDMOverridesBySession,
  listAudioRoomStateBySession,
  upsertAudioRoomStateRecord,
} from '@/repositories/audio.repository'
import { AUDIO_BROADCAST_OVERRIDE_TYPE, getBroadcastRoomId } from './effects.service'

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

export async function getSessionAudioState(sessionId: UUID): Promise<AudioSessionState> {
  const [environments, dmOverrides] = await Promise.all([
    listAudioRoomStateBySession(sessionId),
    listAudioDMOverridesBySession(sessionId),
  ])

  const broadcastRow = dmOverrides.find((row) => row.overrideType === AUDIO_BROADCAST_OVERRIDE_TYPE)
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
      .filter((row) => row.overrideType !== AUDIO_BROADCAST_OVERRIDE_TYPE)
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
