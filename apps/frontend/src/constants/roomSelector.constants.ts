import type { UUID } from '@shared'
import { DISTANCE_PRESETS as SHARED_DISTANCE_PRESETS } from '@shared'
import { DM_FLAVOR_LINES } from './voiceGroup.constants'

/** Distance names for context menu targets. Derived from the canonical shared catalogue. */
export const DISTANCE_PRESETS = SHARED_DISTANCE_PRESETS.map((p) => p.name) as string[]

export function getRoomSelectorDmFlavorLine(dmUserId: UUID, sessionId: UUID): string {
  const seed = `${dmUserId}:${sessionId}`
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index)
    hash |= 0
  }

  return DM_FLAVOR_LINES[Math.abs(hash) % DM_FLAVOR_LINES.length]
}
