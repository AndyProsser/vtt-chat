/**
 * DmdxBlock
 *
 * Dispatcher that routes a parsed DMDX segment to its renderer.
 * Unknown block types are never called here — the parser already
 * falls them back to plain markdown segments.
 */

import type { DmdxBlockType, DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { DmdxEncounterBlock } from './DmdxEncounterBlock'
import { DmdxLootBlock } from './DmdxLootBlock'
import { DmdxMapBlock } from './DmdxMapBlock'
import { DmdxMonsterBlock } from './DmdxMonsterBlock'
import { DmdxNpcBlock } from './DmdxNpcBlock'
import { DmdxRollBlock } from './DmdxRollBlock'
import { DmdxSessionBlock } from './DmdxSessionBlock'
import { DmdxSpellBlock } from './DmdxSpellBlock'
import { DmdxTimelineBlock } from './DmdxTimelineBlock'

interface DmdxBlockProps {
  blockType: DmdxBlockType
  id?: string
  rawContent: string
  parsed: DmdxParsed
}

export function DmdxBlock({ blockType, id, rawContent, parsed }: DmdxBlockProps) {
  switch (blockType) {
    case 'npc':
      return <DmdxNpcBlock parsed={parsed} />
    case 'monster':
      return <DmdxMonsterBlock parsed={parsed} />
    case 'encounter':
      return <DmdxEncounterBlock parsed={parsed} />
    case 'loot':
      return <DmdxLootBlock parsed={parsed} id={id} />
    case 'spell':
      return <DmdxSpellBlock parsed={parsed} />
    case 'session':
      return <DmdxSessionBlock parsed={parsed} />
    case 'roll':
      return <DmdxRollBlock rawContent={rawContent} />
    case 'map':
      return <DmdxMapBlock parsed={parsed} id={id} />
    case 'timeline':
      return <DmdxTimelineBlock parsed={parsed} />
    default:
      // Exhaustiveness guard — should never reach here
      return null
  }
}
