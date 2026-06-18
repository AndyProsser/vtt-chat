import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { DEFAULT_PLAYER_META_LINE } from '@/constants/voiceGroup.constants'
import type { GroupPanelGroupWithParticipants, GroupParticipantStatus } from '@/types/groupPanel'

export function getDisplayGroupName(group: GroupPanelGroupWithParticipants): string {
  if (group.type === RoomType.MAIN) {
    return 'Main'
  }

  return group.name
}

export function getResolvedGroupEnvironmentName(group: GroupPanelGroupWithParticipants): string {
  return group.environmentName || 'Default'
}

export function getGroupStatEntries(member: GroupParticipantStatus): Array<[string, unknown]> {
  if (member.roleLabel === 'DM') {
    return []
  }

  const stats = member.characterStats
  if (!stats) {
    return []
  }

  const typedStats = stats as Record<string, unknown>
  const syncedStats = typedStats.stats as Record<string, unknown> | undefined
  const abilityScores = syncedStats?.abilityScores as Record<string, unknown> | undefined

  const entries: Array<[string, unknown]> = []

  // Resolve a numeric stat: prefer extension-nested value, fall back to flat metadata field.
  function resolveStatNum(syncedVal: unknown, flatVal: unknown): number | undefined {
    const v = syncedVal !== undefined && syncedVal !== null ? syncedVal : flatVal
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  // HP — extension stores as stats.hp.{current,max}; manual/mock stores hpCurrent/hpMax flat.
  const syncedHp = syncedStats?.hp as { current?: number; max?: number } | undefined
  const hpCurrent = resolveStatNum(syncedHp?.current, typedStats.hpCurrent)
  const hpMax = resolveStatNum(syncedHp?.max, typedStats.hpMax)
  if (hpCurrent !== undefined && hpMax !== undefined) {
    entries.push(['HP', `${hpCurrent}/${hpMax}`])
  }

  const ac = resolveStatNum(syncedStats?.ac, typedStats.ac)
  if (ac !== undefined) entries.push(['AC', ac])

  const initiative = resolveStatNum(syncedStats?.initiative, typedStats.initiative)
  if (initiative !== undefined) {
    entries.push(['INIT', `${initiative >= 0 ? '+' : ''}${initiative}`])
  }

  const pp = resolveStatNum(syncedStats?.passivePerception, typedStats.passivePerception)
  if (pp !== undefined) entries.push(['PP', pp])

  const speed = resolveStatNum(syncedStats?.speed, typedStats.speed)
  if (speed !== undefined) entries.push(['SPD', `${speed}ft`])

  // Ability scores — prefer extension values, fall back to manually-entered flat fields
  const ABILITY_MAP: Array<[string, string, string]> = [
    ['STR', 'str', 'strength'],
    ['DEX', 'dex', 'dexterity'],
    ['CON', 'con', 'constitution'],
    ['INT', 'int', 'intelligence'],
    ['WIS', 'wis', 'wisdom'],
    ['CHA', 'cha', 'charisma'],
  ]
  for (const [label, extKey, flatKey] of ABILITY_MAP) {
    const value = abilityScores?.[extKey] ?? typedStats[flatKey]
    if (value !== null && value !== undefined) entries.push([label, value])
  }

  return entries
}

export function getGroupParticipantMetaLine(
  member: GroupParticipantStatus,
  dmFlavorLine: string
): string {
  if (member.roleLabel === 'DM') {
    return dmFlavorLine
  }

  const parts = [
    member.characterClass?.trim(),
    member.characterRace?.trim(),
    typeof member.level === 'number' ? `Level ${member.level}` : undefined,
  ].filter((value): value is string => Boolean(value))

  return parts.length > 0 ? parts.join(' | ') : DEFAULT_PLAYER_META_LINE
}

export function getResolvedGroupPresenceState(presenceState: PresenceState): PresenceState {
  return presenceState === PresenceState.IDLE ? PresenceState.OFFLINE : presenceState
}

export function getGroupPresenceDotState(presenceState: PresenceState): 'online' | 'offline' {
  return getResolvedGroupPresenceState(presenceState) === PresenceState.OFFLINE
    ? 'offline'
    : 'online'
}

export async function waitForGroupDeleteReconciled(options: {
  deletedRoomId: UUID
  sessionId: UUID
  syncSessionTopologyFromServer: () => Promise<void>
  getStoreState: () => {
    rooms: Record<UUID, Record<UUID, { id: UUID }>>
    sessionPresence: Record<UUID, Record<UUID, { primaryRoomId?: UUID }>>
  }
  maxWaitMs?: number
  pollIntervalMs?: number
}): Promise<void> {
  const {
    deletedRoomId,
    sessionId,
    syncSessionTopologyFromServer,
    getStoreState,
    maxWaitMs = 5000,
    pollIntervalMs = 150,
  } = options

  const maxAttempts = Math.ceil(maxWaitMs / pollIntervalMs)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await syncSessionTopologyFromServer()

    const storeState = getStoreState()
    const sessionRooms = storeState.rooms[sessionId] || {}
    const roomStillExists = Boolean(sessionRooms[deletedRoomId])

    if (!roomStillExists) {
      const sessionPresence = storeState.sessionPresence[sessionId] || {}
      const anyUserStillPointingToDeletedRoom = Object.values(sessionPresence).some(
        (entry) => entry?.primaryRoomId === deletedRoomId
      )

      if (!anyUserStillPointingToDeletedRoom) {
        return
      }
    }

    await new Promise((resolve) => window.setTimeout(resolve, pollIntervalMs))
  }

  throw new Error('Group deletion is still reconciling. Please retry in a moment.')
}

// Legacy aliases (Room terminology) kept until migration coverage is complete.
export const getDisplayRoomName = getDisplayGroupName
export const getResolvedEnvironmentName = getResolvedGroupEnvironmentName
export const getStatEntries = getGroupStatEntries
export const getParticipantMetaLine = getGroupParticipantMetaLine
export const getResolvedPresenceState = getResolvedGroupPresenceState
export const getPresenceDotState = getGroupPresenceDotState
export const waitForRoomDeleteReconciled = waitForGroupDeleteReconciled
