import type { CharacterClassEntry } from '@shared'
import type { MockPartyMember, MockPlayerStatus } from '@/types/campaignParty'

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

/** Class entries available for mock characters (class + optional subclass). */
const CLASS_POOL: Array<{ name: string; subclass?: string }> = [
  { name: 'Fighter', subclass: 'Battle Master' },
  { name: 'Fighter', subclass: 'Champion' },
  { name: 'Wizard', subclass: 'Abjurer' },
  { name: 'Wizard', subclass: 'Diviner' },
  { name: 'Rogue', subclass: 'Thief' },
  { name: 'Rogue', subclass: 'Assassin' },
  { name: 'Cleric', subclass: 'Life' },
  { name: 'Cleric', subclass: 'Light' },
  { name: 'Ranger', subclass: 'Hunter' },
  { name: 'Ranger', subclass: 'Beast Master' },
  { name: 'Bard', subclass: 'Lore' },
  { name: 'Bard', subclass: 'Valor' },
  { name: 'Paladin', subclass: 'Devotion' },
  { name: 'Paladin', subclass: 'Vengeance' },
  { name: 'Druid', subclass: 'Land' },
  { name: 'Druid', subclass: 'Moon' },
  { name: 'Warlock', subclass: 'Fiend' },
  { name: 'Warlock', subclass: 'Great Old One' },
  { name: 'Sorcerer', subclass: 'Wild Magic' },
  { name: 'Sorcerer', subclass: 'Storm Sorcery' },
  { name: 'Monk', subclass: 'Open Hand' },
  { name: 'Monk', subclass: 'Shadow' },
  { name: 'Barbarian', subclass: 'Berserker' },
  { name: 'Barbarian', subclass: 'Totem Warrior' },
]

function buildClassEntry(
  entry: { name: string; subclass?: string },
  level: number
): CharacterClassEntry {
  return { name: entry.subclass ? `${entry.name} / ${entry.subclass}` : entry.name, level }
}

const STATUS_POOL: MockPlayerStatus[] = ['here', 'here', 'away', 'lobby', 'not-here', 'offline']

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
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function mockAvatarDataUrl(name: string): string {
  const label = encodeURIComponent(initials(name) || '?')
  const hash = Array.from(name).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  const hueA = hash % 360
  const hueB = (hash + 64) % 360
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='hsl(${hueA} 62% 42%)'/><stop offset='1' stop-color='hsl(${hueB} 55% 34%)'/></linearGradient></defs><rect width='96' height='96' rx='48' fill='url(#g)'/><text x='50%' y='53%' text-anchor='middle' dominant-baseline='middle' font-family='Inter, sans-serif' font-size='34' font-weight='700' fill='white'>${label}</text></svg>`
  return `data:image/svg+xml;utf8,${svg}`
}

function randomStat(): number {
  return Math.min(18, Math.max(6, rnd(3, 6) + rnd(3, 6) + rnd(0, 6)))
}

function randomLastSeen(status: MockPlayerStatus): number {
  const now = Date.now()
  if (status === 'here') return now - rnd(0, 3 * 60 * 1000)
  if (status === 'away') return now - rnd(8 * 60 * 1000, 90 * 60 * 1000)
  if (status === 'lobby') return now - rnd(0, 10 * 60 * 1000)
  if (status === 'not-here') return now - rnd(2 * 60 * 1000, 24 * 60 * 60 * 1000)
  return now - rnd(60 * 60 * 1000, 14 * 24 * 60 * 60 * 1000)
}

export function generateMockParty(): MockPartyMember[] {
  const count = rnd(8, 16)
  const players = pickUnique(PLAYER_NAMES, count)
  const characters = pickUnique(CHARACTER_NAMES, count)

  return players.map((playerName, index) => {
    const characterName = characters[index] ?? `Character ${index + 1}`
    const status = pick(STATUS_POOL)

    // ~1-in-6 chance of multiclass; max 2 classes per character.
    const isMulticlass = Math.random() < 1 / 6
    const totalLevel = rnd(1, 20)
    let classes: CharacterClassEntry[]

    if (isMulticlass) {
      const [primary, secondary] = pickUnique(CLASS_POOL, 2)
      const primaryLevel = Math.max(1, Math.floor(totalLevel / 2))
      const secondaryLevel = Math.max(1, totalLevel - primaryLevel)
      classes = [buildClassEntry(primary, primaryLevel), buildClassEntry(secondary, secondaryLevel)]
    } else {
      classes = [buildClassEntry(pick(CLASS_POOL), totalLevel)]
    }

    return {
      id: `mock-${index}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'PLAYER' as const,
      playerName,
      characterName,
      avatarUrl: mockAvatarDataUrl(characterName),
      avatarInitials: initials(characterName),
      race: pick(RACES),
      characterClass: classes[0].name,
      classes,
      multiclass: isMulticlass,
      level: totalLevel,
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
