import type { UUID } from '@shared'
import type {
  AudioDMOverrideState,
  AudioEnvironmentState,
  AudioSessionState,
  AudioVoiceOfGodState,
} from '@/types/audio.types'
import {
  listAudioDMOverridesBySession,
  listAudioRoomStateBySession,
  removeAudioDMOverrideRecord,
  upsertAudioDMOverrideRecord,
  upsertAudioRoomStateRecord,
} from '@/repositories/audio.repository'

const VOICE_OF_GOD_OVERRIDE = 'VOICE_OF_GOD'

function getVoiceOfGodRoomId(sessionId: UUID): string {
  return `voice-of-god:${sessionId}`
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

  const voiceOfGodRow = dmOverrides.find((row) => row.overrideType === VOICE_OF_GOD_OVERRIDE)
  const voiceOfGod: AudioVoiceOfGodState = {
    enabled: Boolean(voiceOfGodRow),
    dmId: voiceOfGodRow ? (voiceOfGodRow.targetUserId as UUID) : undefined,
    broadcastRoomId: getVoiceOfGodRoomId(sessionId),
    changedAt: voiceOfGodRow?.appliedAt?.getTime(),
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
      .filter((row) => row.overrideType !== VOICE_OF_GOD_OVERRIDE)
      .map((row) => ({
        targetUserId: row.targetUserId as UUID,
        overrideType: row.overrideType,
        parameters: toRecord(row.parameters),
        appliedBy: row.appliedBy as UUID,
        appliedAt: row.appliedAt.getTime(),
      })),
    voiceOfGod,
  }
}

export async function setVoiceOfGodState(params: {
  sessionId: UUID
  dmId: UUID
  enabled: boolean
  changedAt?: number
}): Promise<AudioVoiceOfGodState> {
  const changedAt = params.changedAt ?? Date.now()

  if (params.enabled) {
    await upsertAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: VOICE_OF_GOD_OVERRIDE,
      parameters: { enabled: true, broadcastRoomId: getVoiceOfGodRoomId(params.sessionId) },
      appliedBy: params.dmId,
      appliedAt: new Date(changedAt),
    })
  } else {
    await removeAudioDMOverrideRecord({
      sessionId: params.sessionId,
      targetUserId: params.dmId,
      overrideType: VOICE_OF_GOD_OVERRIDE,
    })
  }

  return {
    enabled: params.enabled,
    dmId: params.dmId,
    broadcastRoomId: getVoiceOfGodRoomId(params.sessionId),
    changedAt,
  }
}
