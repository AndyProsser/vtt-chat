/**
 * Loot Random Service
 * Generates randomised combat loot for /loot-random [CR] [Rarity?] [hoard?].
 * Coin amounts follow the D&D 5e DMG Individual Treasure / Treasure Hoard tables.
 * Item selection draws from the SRD item lists in loot-tables.ts, weighted by rarity.
 */

import {
  RARITY_ORDER,
  ALL_ITEMS_BY_RARITY,
  resolveIndividualTreasureCoin,
  resolveHoardTreasureCoin,
  type LootRarity,
  type LootTableItem,
} from './loot-tables'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LootRandomParams {
  cr: number
  /** null = auto-select based on CR */
  maxRarity: LootRarity | null
  hoard: boolean
  playerCount: number
  avgLevel: number
}

export interface GeneratedLoot {
  items: LootTableItem[]
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
  /** Canonical rarity label used (for error messages / descriptions) */
  maxRarity: LootRarity
  hoard: boolean
  playerCount: number
  avgLevel: number
}

// ─── Args parser ──────────────────────────────────────────────────────────────

const RARITY_ALIASES: Record<string, LootRarity> = {
  mundane: 'mundane',
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  'very-rare': 'very-rare',
  veryrare: 'very-rare',
  legendary: 'legendary',
  artifact: 'artifact',
}

export interface ParsedLootArgs {
  cr: number
  maxRarity: LootRarity | null
  hoard: boolean
}

export interface ParseError {
  message: string
}

export function parseLootRandomArgs(raw: string): ParsedLootArgs | ParseError {
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return { message: 'Usage: /loot-random [CR] [Rarity?] [hoard?] — e.g. /loot-random 8 rare hoard' }
  }

  const crRaw = parseInt(tokens[0], 10)
  if (isNaN(crRaw) || crRaw < 0 || crRaw > 30) {
    return { message: 'CR must be a number between 0 and 30. Usage: /loot-random [CR] [Rarity?] [hoard?]' }
  }

  let maxRarity: LootRarity | null = null
  let hoard = false

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (token === 'hoard') {
      hoard = true
    } else if (RARITY_ALIASES[token]) {
      maxRarity = RARITY_ALIASES[token]
    } else {
      return {
        message: `Unknown argument "${token}". Valid rarities: mundane, common, uncommon, rare, very-rare, legendary, artifact. Use "hoard" to flag a hoard.`,
      }
    }
  }

  return { cr: crRaw, maxRarity, hoard }
}

// ─── Dice helpers ─────────────────────────────────────────────────────────────

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

// ─── Default rarity cap by CR ─────────────────────────────────────────────────

function defaultMaxRarityForCR(cr: number): LootRarity {
  if (cr <= 4) return 'common'
  if (cr <= 10) return 'uncommon'
  if (cr <= 16) return 'rare'
  if (cr <= 20) return 'very-rare'
  return 'legendary'
}

// ─── Item generation ──────────────────────────────────────────────────────────

/**
 * Pick a single rarity tier for one item, biased by CR.
 * Higher CR = higher chance of rolling a premium tier.
 * The result is always capped at maxRarityIdx.
 */
function rollItemRarity(cr: number, maxRarityIdx: number): LootRarity {
  const d20 = rollDie(20)

  let picked: LootRarity
  if (cr <= 4) {
    if (d20 <= 12) picked = 'mundane'
    else if (d20 <= 18) picked = 'common'
    else picked = 'uncommon'
  } else if (cr <= 10) {
    if (d20 <= 6) picked = 'mundane'
    else if (d20 <= 13) picked = 'common'
    else if (d20 <= 18) picked = 'uncommon'
    else picked = 'rare'
  } else if (cr <= 16) {
    if (d20 <= 3) picked = 'mundane'
    else if (d20 <= 7) picked = 'common'
    else if (d20 <= 12) picked = 'uncommon'
    else if (d20 <= 17) picked = 'rare'
    else picked = 'very-rare'
  } else if (cr <= 20) {
    if (d20 <= 4) picked = 'uncommon'
    else if (d20 <= 9) picked = 'rare'
    else if (d20 <= 15) picked = 'very-rare'
    else if (d20 <= 19) picked = 'legendary'
    else picked = 'artifact'
  } else {
    if (d20 <= 3) picked = 'rare'
    else if (d20 <= 9) picked = 'very-rare'
    else if (d20 <= 16) picked = 'legendary'
    else picked = 'artifact'
  }

  const pickedIdx = RARITY_ORDER.indexOf(picked)
  return RARITY_ORDER[Math.min(pickedIdx, maxRarityIdx)]
}

function pickRandomItem(pool: LootTableItem[]): LootTableItem {
  return pool[Math.floor(Math.random() * pool.length)]
}

function generateItems(cr: number, maxRarity: LootRarity, itemCount: number): LootTableItem[] {
  const maxRarityIdx = RARITY_ORDER.indexOf(maxRarity)
  const items: LootTableItem[] = []

  for (let i = 0; i < itemCount; i++) {
    const rarity = rollItemRarity(cr, maxRarityIdx)
    const pool = ALL_ITEMS_BY_RARITY[rarity]
    if (pool.length > 0) {
      items.push(pickRandomItem(pool))
    }
  }

  return items
}

// ─── Item count formula ───────────────────────────────────────────────────────

function generateItemCount(playerCount: number, cr: number, avgLevel: number, hoard: boolean): number {
  const crRatio = Math.min(2.0, Math.max(0.5, cr / Math.max(1, avgLevel)))

  if (hoard) {
    // 150–300% of player count, scaled by CR/level ratio
    const multiplier = 1.5 + Math.random() * 1.5
    return Math.max(1, Math.round(playerCount * crRatio * multiplier))
  }

  // Non-hoard: 50–75% of player count, scaled by CR/level ratio, min 1
  const fraction = 0.5 + Math.random() * 0.25
  return Math.max(1, Math.floor(playerCount * crRatio * fraction))
}

// ─── Coin generation ──────────────────────────────────────────────────────────

function addCoins(
  a: { cp: number; sp: number; ep: number; gp: number; pp: number },
  b: { cp: number; sp: number; ep: number; gp: number; pp: number }
) {
  return { cp: a.cp + b.cp, sp: a.sp + b.sp, ep: a.ep + b.ep, gp: a.gp + b.gp, pp: a.pp + b.pp }
}

function generateCoins(
  cr: number,
  hoard: boolean,
  playerCount: number,
  avgLevel: number
): { cp: number; sp: number; ep: number; gp: number; pp: number } {
  const crRatio = Math.min(2.0, Math.max(0.5, cr / Math.max(1, avgLevel)))

  if (hoard) {
    const base = resolveHoardTreasureCoin(cr, rollDie)
    // Scale by player count and CR ratio; hoard is a shared pile
    const multiplier = playerCount * crRatio
    return {
      cp: Math.round(base.cp * multiplier),
      sp: Math.round(base.sp * multiplier),
      ep: Math.round(base.ep * multiplier),
      gp: Math.round(base.gp * multiplier),
      pp: Math.round(base.pp * multiplier),
    }
  }

  // Non-hoard: sum N individual rolls where N ≈ 50–75% of player count
  const rolls = Math.max(1, Math.floor(playerCount * crRatio * (0.5 + Math.random() * 0.25)))
  let total = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }
  for (let i = 0; i < rolls; i++) {
    total = addCoins(total, resolveIndividualTreasureCoin(cr, rollDie(100), rollDie))
  }
  return total
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate a complete loot result for /loot-random.
 * All randomness is self-contained — call this once per command invocation.
 */
export function generateLoot(params: LootRandomParams): GeneratedLoot {
  const { cr, hoard, playerCount, avgLevel } = params
  const maxRarity = params.maxRarity ?? defaultMaxRarityForCR(cr)

  const itemCount = generateItemCount(playerCount, cr, avgLevel, hoard)
  const items = generateItems(cr, maxRarity, itemCount)
  const coins = generateCoins(cr, hoard, playerCount, avgLevel)

  return {
    items,
    ...coins,
    maxRarity,
    hoard,
    playerCount,
    avgLevel,
  }
}

// ─── Summary string for chat ──────────────────────────────────────────────────

/** Format coin amounts as a readable string, omitting zero denominations. */
export function formatCoins(cp: number, sp: number, ep: number, gp: number, pp: number): string {
  const parts: string[] = []
  if (pp > 0) parts.push(`${pp}pp`)
  if (gp > 0) parts.push(`${gp}gp`)
  if (ep > 0) parts.push(`${ep}ep`)
  if (sp > 0) parts.push(`${sp}sp`)
  if (cp > 0) parts.push(`${cp}cp`)
  return parts.length > 0 ? parts.join(', ') : 'no coins'
}

/** Build the system chat message content for a loot result. */
export function buildLootSummaryMessage(cr: number, loot: GeneratedLoot): string {
  const hoardLabel = loot.hoard ? ' (Hoard)' : ''
  const coinStr = formatCoins(loot.cp, loot.sp, loot.ep, loot.gp, loot.pp)

  // Deduplicate items and show quantity for repeats
  const itemCounts = new Map<string, { name: string; count: number }>()
  for (const item of loot.items) {
    const existing = itemCounts.get(item.srdKey)
    if (existing) {
      existing.count++
    } else {
      itemCounts.set(item.srdKey, { name: item.name, count: 1 })
    }
  }

  const itemLines = [...itemCounts.values()]
    .map((i) => (i.count > 1 ? `${i.name} ×${i.count}` : i.name))
    .join(', ')

  const itemStr = itemLines || 'no items'
  return `[Loot] CR ${cr}${hoardLabel} — Coins: ${coinStr} | Items: ${itemStr} → added to party inventory.`
}
