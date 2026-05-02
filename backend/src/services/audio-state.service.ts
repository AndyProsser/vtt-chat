import type { UUID } from '@shared'
import type {
  AudioDMOverrideState,
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

  return {
    sessionId,
    environments: environments.map((row) => ({
      roomId: row.roomId,
      environmentName: row.environmentName,
      environmentId: row.environmentId,
      parameters: toRecord(row.parameters),
      setBy: row.setBy,
      setAt: row.setAt.getTime(),
    })),
    dmOverrides: dmOverrides.map((row) => ({
      targetUserId: row.targetUserId,
      overrideType: row.overrideType,
      parameters: toRecord(row.parameters),
      appliedBy: row.appliedBy,
      appliedAt: row.appliedAt.getTime(),
    })),
  }
}
