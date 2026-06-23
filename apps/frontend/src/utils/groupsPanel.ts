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

/**
 * Builds the combat + ability-score chips for a group participant from the
 * canonical flat characterStats shape (see normalizeCharacterStats in @shared).
 * The backend normalizes every read path, so this reads flat keys only.
 */
export function getGroupStatEntries(member: GroupParticipantStatus): StatGroups {
  const empty: StatGroups = { combatStats: [], abilityScores: [] }

  if (member.roleLabel === 'DM') return empty

  const stats = member.characterStats
  if (!stats) return empty

  const typedStats = stats as Record<string, unknown>

  function statNum(value: unknown): number | undefined {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }

  const combatStats: Array<[string, string]> = []

  // HP — use min/max to guard against swapped field values in stored data.
  // Display convention: current/max (lower/higher).
  const hpA = statNum(typedStats.hpCurrent)
  const hpB = statNum(typedStats.hpMax)
  if (hpA !== undefined && hpB !== undefined) {
    combatStats.push(['HP', `${Math.min(hpA, hpB)}/${Math.max(hpA, hpB)}`])
  }

  const ac = statNum(typedStats.ac)
  if (ac !== undefined) combatStats.push(['AC', String(ac)])

  const initiative = statNum(typedStats.initiative)
  if (initiative !== undefined) {
    combatStats.push(['INIT', `${initiative >= 0 ? '+' : ''}${initiative}`])
  }

  const pp = statNum(typedStats.passivePerception)
  if (pp !== undefined) combatStats.push(['PP', String(pp)])

  const speed = statNum(typedStats.speed)
  if (speed !== undefined) combatStats.push(['SPD', `${speed}ft`])

  const ABILITY_MAP: Array<[string, string]> = [
    ['STR', 'strength'],
    ['DEX', 'dexterity'],
    ['CON', 'constitution'],
    ['INT', 'intelligence'],
    ['WIS', 'wisdom'],
    ['CHA', 'charisma'],
  ]

  const abilityScores: AbilityScoreStat[] = []
  for (const [label, flatKey] of ABILITY_MAP) {
    const value = statNum(typedStats[flatKey])
    if (value !== undefined) {
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
