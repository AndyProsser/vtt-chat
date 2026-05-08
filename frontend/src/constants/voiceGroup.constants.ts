export const DM_FLAVOR_LINES = [
  'Narrator of chaos and keeper of suspiciously lucky dice.',
  'Architect of dungeons, drama, and carefully balanced panic.',
  'Curator of goblins and consequences.',
  'Provider of lore, loot, and legally distinct dragons.',
  'Wielder of plot hooks and unapologetic cliffhangers.',
  'Keeper of initiative order and suspiciously loaded encounter tables.',
  'Chief wrangler of maps, minis, and magnificent bad decisions.',
  'Arbiter of rules debates and dramatic last-minute saves.',
  'Master of NPC voices and improvised tavern names.',
  'Steward of lore, legends, and totally fair critical hits.',
] as const

export const CONDITION_PRESETS = ['Silenced', 'Poisoned', 'Bleeding', 'Exhausted'] as const

export const LONG_PRESS_OPEN_MS = 420
export const LONG_PRESS_MOVE_CANCEL_PX = 12

export const DEFAULT_PLAYER_META_LINE = 'Class TBD | Level ? | Race TBD'

const ENVIRONMENT_GLYPH_RULES = [
  { icon: 'mountain_flag', keywords: ['cave'] },
  { icon: 'forest', keywords: ['forest', 'wood'] },
  { icon: 'local_bar', keywords: ['tavern'] },
  { icon: 'location_city', keywords: ['city', 'street', 'market'] },
  { icon: 'lan', keywords: ['dungeon', 'crypt'] },
  { icon: 'bedtime', keywords: ['night', 'moon'] },
  { icon: 'thunderstorm', keywords: ['storm', 'rain'] },
] as const

export function resolveEnvironmentGlyph(environmentName?: string): string {
  const value = (environmentName || '').toLowerCase()
  const matchedRule = ENVIRONMENT_GLYPH_RULES.find((rule) =>
    rule.keywords.some((keyword) => value.includes(keyword))
  )

  return matchedRule?.icon || 'graphic_eq'
}
