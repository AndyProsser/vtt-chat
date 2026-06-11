import type { UUID } from '@shared'
import type {
  AudioBroadcastState,
  AudioDMOverrideState,
  AudioEnvironmentState,
  AudioSessionState,
} from '@/types/audio.types'
import {
  listAudioDMOverridesBySession,
  listAudioRoomStateBySession,
  removeAudioRoomStateRecord,
  upsertAudioRoomStateRecord,
} from '@/repositories/audio.repository'
import { AUDIO_BROADCAST_OVERRIDE_TYPE, getBroadcastRoomId } from './effects.service'
import { getRedisClient } from '@/infra/redis'
import { logger } from '@/utils'

function audioEnvironmentsHashKey(sessionId: UUID): string {
  return `audio:session:${sessionId}:environments`
}

function audioOverridesHashKey(sessionId: UUID): string {
  return `audio:session:${sessionId}:overrides`
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseRedisEnvironment(value: string): AudioEnvironmentState | null {
  try {
    const parsed = JSON.parse(value) as Partial<AudioEnvironmentState>
    if (
      typeof parsed.roomId !== 'string' ||
      typeof parsed.environmentName !== 'string' ||
      typeof parsed.environmentId !== 'string' ||
      typeof parsed.setBy !== 'string'
    ) {
      return null
    }

    return {
      roomId: parsed.roomId as UUID,
      environmentName: parsed.environmentName,
      environmentId: parsed.environmentId,
      parameters: toRecord(parsed.parameters),
      setBy: parsed.setBy as UUID,
      setAt: toNumber(parsed.setAt) ?? Date.now(),
    }
  } catch {
    return null
  }
}

function parseRedisOverride(value: string): AudioDMOverrideState | null {
  try {
    const parsed = JSON.parse(value) as Partial<AudioDMOverrideState>
    if (
      typeof parsed.targetUserId !== 'string' ||
      typeof parsed.overrideType !== 'string' ||
      typeof parsed.appliedBy !== 'string'
    ) {
      return null
    }

    return {
      targetUserId: parsed.targetUserId as UUID,
      overrideType: parsed.overrideType,
      parameters: toRecord(parsed.parameters),
      appliedBy: parsed.appliedBy as UUID,
      appliedAt: toNumber(parsed.appliedAt) ?? Date.now(),
    }
  } catch {
    return null
  }
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

  const nextState: AudioEnvironmentState = {
    roomId: params.roomId,
    environmentName: params.environmentName,
    environmentId: params.environmentId,
    parameters: params.parameters || {},
    setBy: params.setBy,
    setAt,
  }

  try {
    const redis = await getRedisClient()
    await redis.hSet(
      audioEnvironmentsHashKey(params.sessionId),
      params.roomId,
      JSON.stringify(nextState)
    )
  } catch (error) {
    logger.warn('audio', 'Failed to mirror room environment state in Redis', {
      sessionId: params.sessionId,
      roomId: params.roomId,
      environmentName: params.environmentName,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return nextState
}

export async function getSessionAudioState(sessionId: UUID): Promise<AudioSessionState> {
  try {
    const redis = await getRedisClient()
    const [environmentEntries, overrideEntries] = await Promise.all([
      redis.hGetAll(audioEnvironmentsHashKey(sessionId)),
      redis.hGetAll(audioOverridesHashKey(sessionId)),
    ])

    const redisEnvironments = Object.values(environmentEntries)
      .map(parseRedisEnvironment)
      .filter((entry): entry is AudioEnvironmentState => entry !== null)

    const redisOverrides = Object.values(overrideEntries)
      .map(parseRedisOverride)
      .filter((entry): entry is AudioDMOverrideState => entry !== null)

    if (redisEnvironments.length > 0 || redisOverrides.length > 0) {
      const broadcastOverride = redisOverrides.find(
        (row) => row.overrideType === AUDIO_BROADCAST_OVERRIDE_TYPE
      )
      const dmOverrides = redisOverrides.filter(
        (row) => row.overrideType !== AUDIO_BROADCAST_OVERRIDE_TYPE
      )

      const broadcast: AudioBroadcastState = {
        enabled: Boolean(broadcastOverride),
        dmId: broadcastOverride?.targetUserId,
        broadcastRoomId: getBroadcastRoomId(sessionId),
        changedAt: broadcastOverride?.appliedAt,
      }

      return {
        sessionId,
        environments: redisEnvironments,
        dmOverrides,
        broadcast,
        voiceOfGod: broadcast,
      }
    }
  } catch (error) {
    logger.warn('audio', 'Failed to read Redis audio projection; falling back to DB', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

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

export async function clearRoomEnvironmentState(params: {
  sessionId: UUID
  roomId: UUID
}): Promise<void> {
  await removeAudioRoomStateRecord({
    sessionId: params.sessionId,
    roomId: params.roomId,
  })

  try {
    const redis = await getRedisClient()
    await redis.hDel(audioEnvironmentsHashKey(params.sessionId), params.roomId)
  } catch (error) {
    logger.warn('audio', 'Failed to clear room environment state in Redis mirror', {
      sessionId: params.sessionId,
      roomId: params.roomId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
