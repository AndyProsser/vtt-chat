export type MockPlayerStatus = 'here' | 'away' | 'lobby' | 'not-here' | 'offline'

export interface MockPartyMember {
  id: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR'
  playerName: string
  characterName: string
  avatarUrl?: string | null
  avatarInitials: string
  dataSource?: 'snapshot' | 'live-merged'
  race: string
  characterClass: string
  subClass?: string
  level: number
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  status: MockPlayerStatus
  lastSeenMs: number
}
