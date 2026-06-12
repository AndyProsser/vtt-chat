import { PresenceState, type UUID } from '@shared'
import type { SessionPresence } from '@/types/room'
import type { MockPartyMember, MockPlayerStatus } from '@/types/campaignParty'

export const AWAY_TIMEOUT_MS = 8 * 60 * 1000
export const AWAY_POLL_INTERVAL_MS = 20 * 1000

export type PartyPresenceStatus = 'HERE' | 'AWAY' | 'LOBBY' | 'NOT_HERE' | 'OFFLINE'

export interface PartyPresenceMemberSnapshot {
  userId: UUID
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR' | 'SYSTEM'
  playerName: string
  avatarUrl?: string | null
  characterName?: string | null
  characterClass?: string | null
  characterSubclass?: string | null
  characterRace?: string | null
  level?: number | null
  characterStats?: Record<string, unknown> | null
  status: PartyPresenceStatus
  runtimePresenceState?: 'ONLINE' | 'TYPING' | 'SPEAKING' | 'IDLE' | 'OFFLINE' | null
  lastSeenAt?: number | null
  manualAway?: boolean
}

export interface PartyPresenceResponse {
  campaignId: UUID
  sessionId: UUID | null
  members: PartyPresenceMemberSnapshot[]
  snapshotAt: number
}

export const STATUS_LABELS: Record<MockPlayerStatus, string> = {
  here: 'HERE',
  away: 'AWAY',
  lobby: 'LOBBY',
  'not-here': 'NOT HERE',
  offline: 'OFFLINE',
}

export const STATUS_SYMBOL: Record<MockPlayerStatus, string> = {
  here: 'radio_button_checked',
  away: 'schedule',
  lobby: 'meeting_room',
  'not-here': 'swap_horiz',
  offline: 'radio_button_unchecked',
}

export const API_TO_UI_STATUS: Record<PartyPresenceStatus, MockPlayerStatus> = {
  HERE: 'here',
  AWAY: 'away',
  LOBBY: 'lobby',
  NOT_HERE: 'not-here',
  OFFLINE: 'offline',
}

export const EMPTY_SESSION_PRESENCE: Record<UUID, SessionPresence> = {}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function toStatValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(1, Math.min(30, Math.round(value)))
}

export function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function mapPresenceStateToUiStatus(state: PresenceState): MockPlayerStatus {
  if (state === PresenceState.IDLE) {
    return 'away'
  }

  if (state === PresenceState.OFFLINE) {
    return 'offline'
  }

  return 'here'
}

export function toMockMember(member: PartyPresenceMemberSnapshot): MockPartyMember {
  const stats = (member.characterStats || {}) as Record<string, unknown>
  const characterName = member.characterName || member.playerName || member.username
  const playerName = member.playerName || member.username

  return {
    id: member.userId,
    role: member.role === 'DM' ? 'DM' : member.role === 'SPECTATOR' ? 'SPECTATOR' : 'PLAYER',
    playerName,
    characterName,
    avatarUrl: member.avatarUrl || null,
    avatarInitials: initialsFromName(characterName || playerName),
    race: member.characterRace || 'Unknown',
    characterClass: member.characterClass || 'Unknown',
    subClass: member.characterSubclass || undefined,
    level: Math.max(1, Math.min(20, Math.round(member.level || 1))),
    stats: {
      str: toStatValue(stats.strength, 10),
      dex: toStatValue(stats.dexterity, 10),
      con: toStatValue(stats.constitution, 10),
      int: toStatValue(stats.intelligence, 10),
      wis: toStatValue(stats.wisdom, 10),
      cha: toStatValue(stats.charisma, 10),
    },
    status: API_TO_UI_STATUS[member.status],
    lastSeenMs: member.lastSeenAt || Date.now(),
  }
}

export function extractConditionLabel(parameters?: Record<string, unknown>): string | null {
  if (!parameters) {
    return null
  }

  const candidates = [
    parameters.conditionName,
    parameters.presetName,
    parameters.name,
    parameters.label,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

export function buildSnapshotWithLivePresence(
  snapshot: PartyPresenceMemberSnapshot,
  livePresence?: SessionPresence
): { snapshot: PartyPresenceMemberSnapshot; source: 'snapshot' | 'live-merged' } {
  if (!livePresence) {
    return { snapshot, source: 'snapshot' }
  }

  let usedLivePresence = false

  const merged: PartyPresenceMemberSnapshot = {
    ...snapshot,
    playerName: hasString(livePresence.playerName)
      ? ((usedLivePresence = usedLivePresence || livePresence.playerName !== snapshot.playerName),
        livePresence.playerName)
      : snapshot.playerName,
    avatarUrl: hasString(livePresence.avatarUrl)
      ? ((usedLivePresence = usedLivePresence || livePresence.avatarUrl !== snapshot.avatarUrl),
        livePresence.avatarUrl)
      : snapshot.avatarUrl,
    characterName: hasString(livePresence.characterName)
      ? ((usedLivePresence =
          usedLivePresence || livePresence.characterName !== snapshot.characterName),
        livePresence.characterName)
      : snapshot.characterName,
    characterClass: hasString(livePresence.characterClass)
      ? ((usedLivePresence =
          usedLivePresence || livePresence.characterClass !== snapshot.characterClass),
        livePresence.characterClass)
      : snapshot.characterClass,
    characterSubclass: hasString(livePresence.characterSubclass)
      ? ((usedLivePresence =
          usedLivePresence || livePresence.characterSubclass !== snapshot.characterSubclass),
        livePresence.characterSubclass)
      : snapshot.characterSubclass,
    characterRace: hasString(livePresence.characterRace)
      ? ((usedLivePresence =
          usedLivePresence || livePresence.characterRace !== snapshot.characterRace),
        livePresence.characterRace)
      : snapshot.characterRace,
    level:
      typeof livePresence.level === 'number'
        ? ((usedLivePresence = usedLivePresence || livePresence.level !== snapshot.level),
          livePresence.level)
        : snapshot.level,
    characterStats:
      livePresence.characterStats && livePresence.characterStats !== snapshot.characterStats
        ? ((usedLivePresence = true), livePresence.characterStats)
        : snapshot.characterStats,
    lastSeenAt:
      typeof livePresence.lastSeenAt === 'number' ? livePresence.lastSeenAt : snapshot.lastSeenAt,
  }

  if (livePresence.state) {
    const nextStatus = livePresence.primaryRoomId
      ? livePresence.state === PresenceState.IDLE
        ? 'AWAY'
        : 'HERE'
      : mapPresenceStateToUiStatus(livePresence.state) === 'away'
        ? 'AWAY'
        : merged.status

    if (nextStatus !== merged.status) {
      usedLivePresence = true
      merged.status = nextStatus
    }
  }

  return { snapshot: merged, source: usedLivePresence ? 'live-merged' : 'snapshot' }
}

export function membersEqual(left: MockPartyMember, right: MockPartyMember): boolean {
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.playerName === right.playerName &&
    left.characterName === right.characterName &&
    left.avatarUrl === right.avatarUrl &&
    left.avatarInitials === right.avatarInitials &&
    left.dataSource === right.dataSource &&
    left.activeCondition === right.activeCondition &&
    left.race === right.race &&
    left.characterClass === right.characterClass &&
    left.subClass === right.subClass &&
    left.level === right.level &&
    left.status === right.status &&
    left.lastSeenMs === right.lastSeenMs &&
    left.stats.str === right.stats.str &&
    left.stats.dex === right.stats.dex &&
    left.stats.con === right.stats.con &&
    left.stats.int === right.stats.int &&
    left.stats.wis === right.stats.wis &&
    left.stats.cha === right.stats.cha
  )
}

export function mergeMembersPreservingReferences(
  previous: MockPartyMember[],
  next: MockPartyMember[]
): MockPartyMember[] {
  const previousById = new Map(previous.map((member) => [member.id, member]))
  let hasAnyChange = previous.length !== next.length

  const merged = next.map((member) => {
    const previousMember = previousById.get(member.id)
    if (previousMember && membersEqual(previousMember, member)) {
      return previousMember
    }

    hasAnyChange = true
    return member
  })

  return hasAnyChange ? merged : previous
}

export type GroupedMembers = Array<{
  groupLabel: string
  members: MockPartyMember[]
}>

export function groupMembersByStatusAndRole(members: MockPartyMember[]): GroupedMembers {
  const dmMembers = members.filter((m) => m.role === 'DM')
  const playersByStatus: Record<MockPlayerStatus, MockPartyMember[]> = {
    here: [],
    away: [],
    lobby: [],
    'not-here': [],
    offline: [],
  }

  members.forEach((member) => {
    if (member.role !== 'DM') {
      playersByStatus[member.status]?.push(member)
    }
  })

  const groups: GroupedMembers = []

  if (dmMembers.length > 0) {
    groups.push({ groupLabel: 'DM', members: dmMembers })
  }

  const statusOrder: MockPlayerStatus[] = ['here', 'away', 'lobby', 'not-here', 'offline']
  for (const status of statusOrder) {
    const statusMembers = playersByStatus[status]
    if (statusMembers.length > 0) {
      groups.push({ groupLabel: STATUS_LABELS[status] || status, members: statusMembers })
    }
  }

  return groups
}
