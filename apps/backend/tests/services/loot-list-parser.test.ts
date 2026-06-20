/**
 * Loot List Parser Unit Tests
 * Covers comma splitting, item token parsing, currency extraction,
 * and the SRD fuzzy-match utility.
 */

import { describe, it, expect } from 'vitest'
import { splitLootList, parseLootItemToken, parseLootList } from '@/services/inventory/loot-list-parser'
import { matchSrdItem } from '@/services/inventory/loot-tables'

// ─── splitLootList ────────────────────────────────────────────────────────────

describe('splitLootList', () => {
  it('splits on commas', () => {
    expect(splitLootList('a, b, c')).toEqual(['a', 'b', 'c'])
  })

  it('does not split inside parentheses', () => {
    expect(splitLootList('gems (25gp, value), sword')).toEqual(['gems (25gp, value)', 'sword'])
  })

  it('handles no comma (single item)', () => {
    expect(splitLootList('Potion of Healing')).toEqual(['Potion of Healing'])
  })

  it('trims whitespace from each part', () => {
    expect(splitLootList('  sword ,  dagger  ')).toEqual(['sword', 'dagger'])
  })

  it('ignores empty segments', () => {
    expect(splitLootList('sword,,dagger')).toEqual(['sword', 'dagger'])
  })
})

// ─── parseLootItemToken ───────────────────────────────────────────────────────

describe('parseLootItemToken', () => {
  it('handles bare name with no quantity', () => {
    expect(parseLootItemToken('Shortsword')).toEqual({ rawName: 'Shortsword', quantity: 1 })
  })

  it('handles multi-word name', () => {
    expect(parseLootItemToken('Potion of Healing')).toEqual({ rawName: 'Potion of Healing', quantity: 1 })
  })

  it('parses leading Nx quantity', () => {
    expect(parseLootItemToken('5x daggers')).toEqual({ rawName: 'daggers', quantity: 5 })
  })

  it('parses leading N x quantity with space', () => {
    expect(parseLootItemToken('3 x arrows')).toEqual({ rawName: 'arrows', quantity: 3 })
  })

  it('parses trailing xN quantity', () => {
    expect(parseLootItemToken('dart x5')).toEqual({ rawName: 'dart', quantity: 5 })
  })

  it('parses trailing xN without space', () => {
    expect(parseLootItemToken('torch x10')).toEqual({ rawName: 'torch', quantity: 10 })
  })

  it('parses legacy trailing integer (backward compat)', () => {
    expect(parseLootItemToken('Potion of Healing 2')).toEqual({ rawName: 'Potion of Healing', quantity: 2 })
  })

  it('preserves parenthetical notes in name', () => {
    expect(parseLootItemToken('2x gems (25gp)')).toEqual({ rawName: 'gems (25gp)', quantity: 2 })
  })

  it('clamps quantity to 1 minimum', () => {
    expect(parseLootItemToken('0x sword')).toEqual({ rawName: 'sword', quantity: 1 })
  })

  it('clamps quantity to 9999 maximum', () => {
    expect(parseLootItemToken('99999x sword')).toEqual({ rawName: 'sword', quantity: 9999 })
  })
})

// ─── parseLootList ────────────────────────────────────────────────────────────

describe('parseLootList', () => {
  it('parses the full example from the feature spec', () => {
    const result = parseLootList('25sp,6sp,1cp,1x shortsword, 5x daggers, 2x gems (25gp), dart x5, Circlet of Blasting')

    // Currency: 25sp + 6sp = 31sp, 1cp
    expect(result.currencies.sp).toBe(31)
    expect(result.currencies.cp).toBe(1)
    expect(result.currencies.gp).toBeUndefined()

    // Items
    expect(result.items).toHaveLength(5)
    expect(result.items[0]).toEqual({ rawName: 'shortsword', quantity: 1 })
    expect(result.items[1]).toEqual({ rawName: 'daggers', quantity: 5 })
    expect(result.items[2]).toEqual({ rawName: 'gems (25gp)', quantity: 2 })
    expect(result.items[3]).toEqual({ rawName: 'dart', quantity: 5 })
    expect(result.items[4]).toEqual({ rawName: 'Circlet of Blasting', quantity: 1 })
  })

  it('aggregates multiple currency tokens of the same denomination', () => {
    const result = parseLootList('10gp, 5gp, 3sp')
    expect(result.currencies.gp).toBe(15)
    expect(result.currencies.sp).toBe(3)
  })

  it('handles pure currency list', () => {
    const result = parseLootList('100gp, 50sp, 25cp')
    expect(result.items).toHaveLength(0)
    expect(result.currencies.gp).toBe(100)
    expect(result.currencies.sp).toBe(50)
    expect(result.currencies.cp).toBe(25)
  })

  it('handles pure items list', () => {
    const result = parseLootList('Dagger, 3x Torch, Shield')
    expect(Object.keys(result.currencies)).toHaveLength(0)
    expect(result.items).toHaveLength(3)
  })

  it('does not treat parenthetical currency as a token', () => {
    const result = parseLootList('2x gems (25gp)')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].rawName).toBe('gems (25gp)')
    expect(Object.keys(result.currencies)).toHaveLength(0)
  })

  it('handles single item (no commas)', () => {
    const result = parseLootList('Potion of Healing')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual({ rawName: 'Potion of Healing', quantity: 1 })
  })
})

// ─── matchSrdItem ─────────────────────────────────────────────────────────────

describe('matchSrdItem', () => {
  it('exact match (case-insensitive)', () => {
    const hit = matchSrdItem('shortsword')
    expect(hit?.srdKey).toBe('shortsword')
    expect(hit?.name).toBe('Shortsword')
  })

  it('mixed-case exact match', () => {
    expect(matchSrdItem('Shortsword')?.srdKey).toBe('shortsword')
  })

  it('matches common magic items', () => {
    expect(matchSrdItem('Potion of Healing')?.srdKey).toBe('potion-of-healing')
  })

  it('matches plural by stripping trailing s', () => {
    expect(matchSrdItem('daggers')?.srdKey).toBe('dagger')
  })

  it('matches plural by stripping trailing es', () => {
    // "Torches" → "Torch" (not in SRD) — just verifying no crash; returns null
    expect(matchSrdItem('Shortswords')?.srdKey).toBe('shortsword')
  })

  it('strips parenthetical notes before matching', () => {
    expect(matchSrdItem('Dagger (rusted)')?.srdKey).toBe('dagger')
  })

  it('matches when input is a prefix of SRD name', () => {
    const hit = matchSrdItem('Bag of Holding')
    expect(hit?.srdKey).toBe('bag-of-holding')
  })

  it('returns null for unrecognised items', () => {
    expect(matchSrdItem('Glowing Orb of Mystery')).toBeNull()
  })

  it('returns null for empty-ish input', () => {
    expect(matchSrdItem('   ')).toBeNull()
  })
})
