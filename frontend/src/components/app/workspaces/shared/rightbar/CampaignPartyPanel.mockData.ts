/** DEV-only mock player generator for the Party Sheet panel.
 * Produces purely visual, ephemeral data — nothing persisted to any store or API.
 * Generated players are discarded when the component unmounts.
 */

export type MockPlayerStatus = 'here' | 'away' | 'lobby' | 'not-here' | 'offline'

export interface MockPartyMember {
  id: string
  playerName: string
  characterName: string
  avatarInitials: string
  race: string
  characterClass: string
  level: number
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  status: MockPlayerStatus
  lastSeenMs: number // epoch ms
}

// ─── Data pools ────────────────────────────────────────────────────────────────

const PLAYER_NAMES = [
  'Ambrose',
  'Britt',
  'Cael',
  'Dara',
  'Edvin',
  'Faye',
  'Gorm',
  'Hilde',
  'Idris',
  'Jory',
  'Kira',
  'Lorne',
  'Myra',
  'Nessa',
  'Oryn',
  'Petra',
  'Quill',
  'Riven',
  'Sable',
  'Tarn',
  'Ursa',
  'Vex',
  'Wren',
  'Xael',
]

const CHARACTER_NAMES = [
  'Thalindra Swiftblade',
  'Borin Stonefist',
  'Lyra Sunshadow',
  'Mira Cloudwhisper',
  'Kess Darkwater',
  'Aldric Ironforge',
  'Sylvara Moonpetal',
  'Dagon Ashcroft',
  'Elowen Brightflame',
  'Torvin Graymane',
  'Zara Nightfall',
  'Caius Emberwatch',
  'Nyx Hollowbane',
  'Rowan Stormveil',
  'Isadora Frostwick',
  'Brennan Coldstone',
  'Vespera Ashwood',
  'Gareth Sunforged',
  'Tamsin Wildmere',
  'Orin Blackthorn',
]

const RACES = [
  'Human',
  'Elf',
  'Dwarf',
  'Half-Elf',
  'Gnome',
  'Tiefling',
  'Dragonborn',
  'Halfling',
  'Orc',
  'Aasimar',
]

const CLASSES = [
  'Fighter',
  'Wizard',
  'Rogue',
  'Cleric',
  'Ranger',
  'Bard',
  'Paladin',
  'Druid',
  'Warlock',
  'Sorcerer',
  'Monk',
  'Barbarian',
]

const STATUS_POOL: MockPlayerStatus[] = ['here', 'here', 'away', 'lobby', 'not-here', 'offline']

// ─── Helpers ───────────────────────────────────────────────────────────────────

function rnd(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function pickUnique<T>(arr: T[], count: number): T[] {
  const pool = [...arr]
  const result: T[] = []
  while (result.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    result.push(pool.splice(idx, 1)[0])
  }
  return result
}

function initials(name: string): string {
  const parts = name.trim().split(' ')
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

function randomStat(): number {
  // 3d6 style distribution, clamped 6–18
  return Math.min(18, Math.max(6, rnd(3, 6) + rnd(3, 6) + rnd(0, 6)))
}

function randomLastSeen(status: MockPlayerStatus): number {
  const now = Date.now()
  if (status === 'here') return now - rnd(0, 3 * 60 * 1000) // up to 3 min ago
  if (status === 'away') return now - rnd(8 * 60 * 1000, 90 * 60 * 1000) // 8 min – 1.5 hr
  if (status === 'lobby') return now - rnd(0, 10 * 60 * 1000) // up to 10 min ago
  if (status === 'not-here') return now - rnd(2 * 60 * 1000, 24 * 60 * 60 * 1000) // 2 min – 24 hr
  return now - rnd(60 * 60 * 1000, 14 * 24 * 60 * 60 * 1000) // 1 hr – 14 days
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Generate 8–16 unique mock party members for DEV visual purposes. */
export function generateMockParty(): MockPartyMember[] {
  const count = rnd(8, 16)
  const players = pickUnique(PLAYER_NAMES, count)
  const characters = pickUnique(CHARACTER_NAMES, count)

  return players.map((playerName, i) => {
    const characterName = characters[i] ?? `Character ${i + 1}`
    const status = pick(STATUS_POOL)
    return {
      id: `mock-${i}-${Math.random().toString(36).slice(2, 7)}`,
      playerName,
      characterName,
      avatarInitials: initials(characterName),
      race: pick(RACES),
      characterClass: pick(CLASSES),
      level: rnd(1, 20),
      stats: {
        str: randomStat(),
        dex: randomStat(),
        con: randomStat(),
        int: randomStat(),
        wis: randomStat(),
        cha: randomStat(),
      },
      status,
      lastSeenMs: randomLastSeen(status),
    }
  })
}

/** Format a last-seen epoch ms into a human-readable relative string. */
export function formatLastSeen(epochMs: number): string {
  const diffMs = Date.now() - epochMs
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
}
