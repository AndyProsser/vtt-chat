import type { UUID } from '@shared'
import type { AudioDMOverride } from '@/types/audio'

export type AudioDMOverrideKey = AudioDMOverride['overrideType'] | 'DISTANCE' | 'VOICE' | 'FILTER'

export type AudioDMOverridesByUser = Map<UUID, Map<AudioDMOverrideKey, AudioDMOverride>>

function normalizePresetCategory(value: unknown): AudioDMOverrideKey | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toUpperCase()
  if (
    normalized === 'DISTANCE' ||
    normalized === 'CONDITION' ||
    normalized === 'VOICE' ||
    normalized === 'FILTER'
  ) {
    return normalized
  }

  return undefined
}

export function getAudioDMOverrideKey(params: {
  overrideType: AudioDMOverride['overrideType']
  parameters?: Record<string, unknown>
}): AudioDMOverrideKey {
  if (params.overrideType === 'FILTER') {
    return normalizePresetCategory(params.parameters?.presetCategory) || 'FILTER'
  }

  return params.overrideType
}

export function getUserDMOverrides(
  dmOverrides: AudioDMOverridesByUser,
  userId: UUID
): AudioDMOverride[] {
  return [...(dmOverrides.get(userId)?.values() || [])]
}

export function getUserDMOverride(
  dmOverrides: AudioDMOverridesByUser,
  userId: UUID,
  key: AudioDMOverrideKey
): AudioDMOverride | undefined {
  return dmOverrides.get(userId)?.get(key)
}

export function replaceAudioDMOverrides(overrides: AudioDMOverride[]): AudioDMOverridesByUser {
  const next = new Map<UUID, Map<AudioDMOverrideKey, AudioDMOverride>>()

  for (const override of overrides) {
    const existing = next.get(override.userId) || new Map<AudioDMOverrideKey, AudioDMOverride>()
    existing.set(getAudioDMOverrideKey(override), override)
    next.set(override.userId, existing)
  }

  return next
}

export function upsertAudioDMOverride(
  dmOverrides: AudioDMOverridesByUser,
  override: AudioDMOverride
): AudioDMOverridesByUser {
  const next = new Map(dmOverrides)
  const userOverrides = new Map(next.get(override.userId) || [])
  userOverrides.set(getAudioDMOverrideKey(override), override)
  next.set(override.userId, userOverrides)
  return next
}

export function removeAudioDMOverride(
  dmOverrides: AudioDMOverridesByUser,
  userId: UUID,
  key: AudioDMOverrideKey
): AudioDMOverridesByUser {
  const userOverrides = dmOverrides.get(userId)
  if (!userOverrides) {
    return dmOverrides
  }

  const next = new Map(dmOverrides)
  const nextUserOverrides = new Map(userOverrides)
  nextUserOverrides.delete(key)

  if (nextUserOverrides.size === 0) {
    next.delete(userId)
    return next
  }

  next.set(userId, nextUserOverrides)
  return next
}

export function flattenAudioDMOverrides(dmOverrides: AudioDMOverridesByUser): AudioDMOverride[] {
  return [...dmOverrides.values()].flatMap((userOverrides) => [...userOverrides.values()])
}
