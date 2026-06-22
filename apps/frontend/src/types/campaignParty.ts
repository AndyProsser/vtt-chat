import type { CharacterClassEntry } from '@shared'

export type MockPlayerStatus = 'here' | 'away' | 'lobby' | 'not-here' | 'offline'

export interface MockPartyMember {
  id: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR'
  playerName: string
  characterName: string
  avatarUrl?: string | null
  avatarInitials: string
  dataSource?: 'snapshot' | 'live-merged'
  activeCondition?: string | null
  race: string
  /** Merged primary class string, e.g. "Fighter / Battle Master". */
  characterClass: string
  /** Full class array. Single-element for non-multiclassed characters. */
  classes: CharacterClassEntry[]
  multiclass: boolean
  level: number
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  status: MockPlayerStatus
  lastSeenMs: number
}
