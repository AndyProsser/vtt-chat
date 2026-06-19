import { PresenceState, RoomType } from '@shared'
import type { UUID } from '@shared'
import { DEFAULT_PLAYER_META_LINE } from '@/constants/voiceGroup.constants'
import type {
  AbilityScoreStat,
  GroupPanelGroupWithParticipants,
  GroupParticipantStatus,
  StatGroups,
} from '@/types/groupPanel'

export function getDisplayGroupName(group: GroupPanelGroupWithParticipants): string {
  if (group.type === RoomType.MAIN) {
    return 'Main'
  }

  return group.name
}

export function getResolvedGroupEnvironmentName(group: GroupPanelGroupWithParticipants): string {
  return group.environmentName || 'Default'
}

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

export function getGroupStatEntries(member: GroupParticipantStatus): StatGroups {
  const empty: StatGroups = { combatStats: [], abilityScores: [] }

  if (member.roleLabel === 'DM') return empty

  const stats = member.characterStats
  if (!stats) return empty

  const typedStats = stats as Record<string, unknown>
  const syncedStats = typedStats.stats as Record<string, unknown> | undefined
  const syncedAbility = syncedStats?.abilityScores as Record<string, unknown> | undefined

  function resolveStatNum(syncedVal: unknown, flatVal: unknown): number | undefined {
    const v = syncedVal !== undefined && syncedVal !== null ? syncedVal : flatVal
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }

  const combatStats: Array<[string, string]> = []

  // HP — use min/max to guard against swapped field values in stored data.
  // Display convention: current/max (lower/higher).
  const syncedHp = syncedStats?.hp as { current?: number; max?: number } | undefined
  const hpA = resolveStatNum(syncedHp?.current, typedStats.hpCurrent)
  const hpB = resolveStatNum(syncedHp?.max, typedStats.hpMax)
  if (hpA !== undefined && hpB !== undefined) {
    combatStats.push(['HP', `${Math.min(hpA, hpB)}/${Math.max(hpA, hpB)}`])
  }

  const ac = resolveStatNum(syncedStats?.ac, typedStats.ac)
  if (ac !== undefined) combatStats.push(['AC', String(ac)])

  const initiative = resolveStatNum(syncedStats?.initiative, typedStats.initiative)
  if (initiative !== undefined) {
    combatStats.push(['INIT', `${initiative >= 0 ? '+' : ''}${initiative}`])
  }

  const pp = resolveStatNum(syncedStats?.passivePerception, typedStats.passivePerception)
  if (pp !== undefined) combatStats.push(['PP', String(pp)])

  const speed = resolveStatNum(syncedStats?.speed, typedStats.speed)
  if (speed !== undefined) combatStats.push(['SPD', `${speed}ft`])

  const ABILITY_MAP: Array<[string, string, string]> = [
    ['STR', 'str', 'strength'],
    ['DEX', 'dex', 'dexterity'],
    ['CON', 'con', 'constitution'],
    ['INT', 'int', 'intelligence'],
    ['WIS', 'wis', 'wisdom'],
    ['CHA', 'cha', 'charisma'],
  ]

  const abilityScores: AbilityScoreStat[] = []
  for (const [label, extKey, flatKey] of ABILITY_MAP) {
    const raw = syncedAbility?.[extKey] ?? typedStats[flatKey]
    const value = Number(raw)
    if (raw !== null && raw !== undefined && Number.isFinite(value)) {
      abilityScores.push({ label, value, modifier: abilityMod(value) })
    }
  }

  return { combatStats, abilityScores }
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
