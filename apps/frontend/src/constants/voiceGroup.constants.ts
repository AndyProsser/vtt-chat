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

import { CONDITION_PRESETS as SHARED_CONDITION_PRESETS, ENVIRONMENT_PRESETS } from '@shared'

/** Condition names for context menu targets. Derived from the canonical shared catalogue. */
export const CONDITION_PRESETS = SHARED_CONDITION_PRESETS.map((p) => p.name) as string[]

export const LONG_PRESS_OPEN_MS = 420
export const LONG_PRESS_MOVE_CANCEL_PX = 12

export const DEFAULT_PLAYER_META_LINE = 'Class TBD | Level ? | Race TBD'

/** Resolves the Material Symbol icon for an environment by name. Uses the shared catalogue first, falls back to keyword matching. */
export function resolveEnvironmentGlyph(environmentName?: string): string {
  if (!environmentName) return 'graphic_eq'

  const match = ENVIRONMENT_PRESETS.find(
    (p) => p.name.toLowerCase() === environmentName.toLowerCase()
  )
  if (match) return match.icon

  // Keyword fallback for custom/unknown environment names
  const value = environmentName.toLowerCase()
  if (value.includes('cave')) return 'mountain_flag'
  if (value.includes('forest') || value.includes('wood')) return 'forest'
  if (value.includes('tavern')) return 'local_bar'
  if (value.includes('city') || value.includes('street')) return 'location_city'
  if (value.includes('dungeon') || value.includes('crypt')) return 'lan'
  if (value.includes('night') || value.includes('moon')) return 'bedtime'
  if (value.includes('storm') || value.includes('rain')) return 'thunderstorm'
  if (value.includes('cathedral') || value.includes('church')) return 'church'
  if (value.includes('water') || value.includes('under')) return 'water'

  return 'graphic_eq'
}
