import { RoomType, SessionState, buildCampaignSessionName, isGreenroomSessionState } from '@shared'
import type { UUID } from '@shared'
import { isGreenRoomName } from '../../constants/roomPresence.constants'
import {
  DEFAULT_GREENROOM_CACHE_TTL_MS,
  ROOM_ENVIRONMENT_PRESET_FALLBACKS,
  SESSION_BOOKEND_PREFIXES,
} from '../../constants/workspaces.constants'
import type { Session as SessionRecord } from '@/types/session'
import type { Room as RoomRecord } from '@/types/room'
import type { PlayerSettingsPanel } from '@/components/workspaces/shared/panels/PlayerSettingsPanel'
import type { UserCharacterRecord } from '@/types/session/workspaces'

export function safeLocalStorageGetItem(key: string): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return null
  }

  return window.localStorage.getItem(key)
}

export function safeLocalStorageSetItem(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage?.setItem !== 'function') {
    return
  }

  window.localStorage.setItem(key, value)
}

export function safeLocalStorageRemoveItem(key: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage?.removeItem !== 'function') {
    return
  }

  window.localStorage.removeItem(key)
}

export function isSessionBookendMessage(content: string): boolean {
  return SESSION_BOOKEND_PREFIXES.some((prefix) => content.startsWith(prefix))
}

export function buildRoomEnvironmentPreset(roomId: UUID, environmentName: string) {
  const key = environmentName.trim().toLowerCase()
  const fallback =
    ROOM_ENVIRONMENT_PRESET_FALLBACKS[key] || ROOM_ENVIRONMENT_PRESET_FALLBACKS.default

  return {
    id: roomId,
    name: environmentName,
    reverbSend: fallback.reverbSend,
    lowpassFreq: fallback.lowpassFreq,
    roomGain: fallback.roomGain,
  }
}

export function resolveGreenroomCacheTtlMs(): number {
  const raw = Number(import.meta.env.VITE_GREENROOM_CACHE_TTL_MS)

  if (!Number.isFinite(raw) || raw < 0) {
    return DEFAULT_GREENROOM_CACHE_TTL_MS
  }

  return raw
}

export const DEFAULT_CHARACTER_SETTINGS: PlayerSettingsPanel = {
  name: '',
  race: 'Human',
  className: 'Fighter',
  subclass: '',
  avatarUrl: '',
  level: 1,
  strength: 8,
  dexterity: 8,
  constitution: 8,
  intelligence: 8,
  wisdom: 8,
  charisma: 8,
  hpCurrent: 0,
  hpMax: 0,
  ac: 0,
  initiative: 0,
  passivePerception: 10,
  speed: 30,
  conditions: '',
}

export const SESSION_TIMER_SYNC_POLL_MS = 30_000

export function toValidStat(value: unknown, fallback = 8): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(30, Math.round(parsed)))
}

export function buildCharacterDraft(character: UserCharacterRecord | null): PlayerSettingsPanel {
  if (!character) {
    return { ...DEFAULT_CHARACTER_SETTINGS }
  }

  const metadata = character.metadata || {}
  // Extension-synced values live in metadata.stats; manual entries are flat in metadata.
  // Prefer extension values when present so the panel reflects the live character sheet.
  const synced = metadata.stats as Record<string, unknown> | undefined
  const syncedHp = synced?.hp as { current?: number; max?: number } | undefined
  const syncedAbility = synced?.abilityScores as Record<string, unknown> | undefined

  function resolveNum(
    syncedVal: unknown,
    flatVal: unknown,
    fallback: number,
    min = 0,
    max = 9999
  ): number {
    const v = syncedVal !== undefined && syncedVal !== null ? syncedVal : flatVal
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback
  }

  const conditions =
    Array.isArray(synced?.conditions) && synced!.conditions.length > 0
      ? (synced!.conditions as string[]).join(', ')
      : Array.isArray(metadata.conditions) && (metadata.conditions as string[]).length > 0
        ? (metadata.conditions as string[]).join(', ')
        : typeof metadata.conditions === 'string'
          ? metadata.conditions
          : ''

  return {
    name: character.name || '',
    race: character.race || 'Human',
    className: character.class || 'Fighter',
    subclass: character.subclass || '',
    avatarUrl: character.avatarUrl || '',
    level: Math.max(1, Math.min(20, Number(metadata.level) || 1)),
    strength: resolveNum(syncedAbility?.str, metadata.strength, 8, 1, 30),
    dexterity: resolveNum(syncedAbility?.dex, metadata.dexterity, 8, 1, 30),
    constitution: resolveNum(syncedAbility?.con, metadata.constitution, 8, 1, 30),
    intelligence: resolveNum(syncedAbility?.int, metadata.intelligence, 8, 1, 30),
    wisdom: resolveNum(syncedAbility?.wis, metadata.wisdom, 8, 1, 30),
    charisma: resolveNum(syncedAbility?.cha, metadata.charisma, 8, 1, 30),
    hpCurrent: resolveNum(syncedHp?.current, metadata.hpCurrent, 0, 0, 999),
    hpMax: resolveNum(syncedHp?.max, metadata.hpMax, 0, 0, 999),
    ac: resolveNum(synced?.ac, metadata.ac, 0, 0, 30),
    initiative: resolveNum(synced?.initiative, metadata.initiative, 0, -10, 20),
    passivePerception: resolveNum(synced?.passivePerception, metadata.passivePerception, 10, 1, 30),
    speed: resolveNum(synced?.speed, metadata.speed, 30, 0, 120),
    conditions,
  }
}

export function getPreferredSession(sessions: SessionRecord[]): SessionRecord | null {
  if (sessions.length === 0) return null

  const active = sessions.find((session) => session.state === SessionState.ACTIVE)
  if (active) return active

  const paused = sessions.find((session) => session.state === SessionState.PAUSED)
  if (paused) return paused

  const draftIdle = sessions.find(
    (session) =>
      session.state === SessionState.IDLE &&
      session.startedAt === undefined &&
      session.endedAt === undefined
  )
  if (draftIdle) return draftIdle

  const cooldown = sessions.find((session) => session.state === SessionState.COOLDOWN)
  if (cooldown) return cooldown

  const ended = sessions.find((session) => session.state === SessionState.ENDED)
  if (ended) return ended

  return null
}

export function getSessionsSortedChronologically(sessions: SessionRecord[]): SessionRecord[] {
  return [...sessions].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }

    return left.id.localeCompare(right.id)
  })
}

export function getLatestSessionChronologically(sessions: SessionRecord[]): SessionRecord | null {
  const sorted = getSessionsSortedChronologically(sessions)
  return sorted.length ? sorted[sorted.length - 1] : null
}

export function buildDefaultChapterName(
  existingSessions: SessionRecord[],
  baseName = 'Session'
): string {
  return buildCampaignSessionName({
    baseName,
    sessionNumber: existingSessions.length + 1,
  })
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }

    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

export function normalizeSessionRecord(raw: SessionRecord): SessionRecord {
  const createdAt = normalizeTimestamp((raw as SessionRecord & { createdAt?: unknown }).createdAt)
  const startedAt = normalizeTimestamp((raw as SessionRecord & { startedAt?: unknown }).startedAt)
  const pausedAt = normalizeTimestamp((raw as SessionRecord & { pausedAt?: unknown }).pausedAt)
  const endedAt = normalizeTimestamp((raw as SessionRecord & { endedAt?: unknown }).endedAt)
  const updatedAt = normalizeTimestamp((raw as SessionRecord & { updatedAt?: unknown }).updatedAt)

  return {
    ...raw,
    createdAt: createdAt ?? Date.now(),
    startedAt,
    pausedAt,
    endedAt,
    updatedAt,
  }
}

export function isGreenRoom(room: Pick<RoomRecord, 'type' | 'name'>): boolean {
  if (room.type !== RoomType.GROUP) {
    return false
  }

  return isGreenRoomName(room.name)
}

export function getVisibleRoomsForSessionState(
  rooms: RoomRecord[],
  state: SessionState
): RoomRecord[] {
  if (!rooms.length) {
    return rooms
  }

  if (isGreenroomSessionState(state)) {
    const greenRooms = rooms.filter((room) => isGreenRoom(room))
    return greenRooms.length ? greenRooms : rooms
  }

  if (state === SessionState.ACTIVE || state === SessionState.PAUSED) {
    return rooms
  }

  return rooms
}

export function toSessionStateValue(state: SessionState): SessionState {
  return state
}

export function parsePlayerInviteCode(input: string): string {
  const raw = input.trim()
  if (!raw) {
    return ''
  }

  try {
    const parsedUrl = new URL(raw)
    const joinMatch = parsedUrl.pathname.match(/\/join\/([^/?#]+)/i)
    if (joinMatch?.[1]) {
      return decodeURIComponent(joinMatch[1]).trim().toUpperCase()
    }
  } catch {
    // Input may be plain invite code or a relative join path.
  }

  const pathMatch = raw.match(/\/join\/([^/?#]+)/i)
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]).trim().toUpperCase()
  }

  return raw.toUpperCase()
}

export function toValidPostSessionDurationMinutes(value: unknown, fallback = 5): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, Math.min(15, Math.round(parsed)))
}

export function formatDurationCompact(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '0m'
  }

  const totalMinutes = Math.round(durationMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours <= 0) {
    return `${minutes}m`
  }

  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}
