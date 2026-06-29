/**
 * Unit tests for normalizeFromSrd — verifies both the 2014 and 2024 SRD API
 * schemas map to the same canonical ItemMetadata shape.
 *
 * Regression guard: the 2024 endpoint uses `equipment_categories[]` (array),
 * `description` instead of `desc`, and gives melee weapons a 5 ft `range`. An
 * earlier normaliser only read 2014 field names, so 2024 items (the default
 * ruleset) came back with empty metadata.
 */

import { describe, it, expect } from 'vitest'
import { normalizeFromSrd } from '@shared'

describe('normalizeFromSrd — 2024 schema', () => {
  it('maps a versatile melee weapon (longsword)', () => {
    const meta = normalizeFromSrd({
      equipment_categories: [
        { index: 'martial-melee-weapons', name: 'Martial Melee Weapons' },
        { index: 'weapons', name: 'Weapons' },
      ],
      cost: { quantity: 15, unit: 'gp' },
      damage: { damage_dice: '1d8', damage_type: { name: 'Slashing' } },
      range: { normal: 5 }, // melee reach — must NOT become a Range pill
      weight: 3,
      properties: [{ name: 'Versatile' }],
      two_handed_damage: { damage_dice: '1d10' },
    })

    expect(meta.itemType).toBe('Weapon')
    expect(meta.itemSubtype).toBe('Martial Melee')
    expect(meta.weight).toBe(3)
    expect(meta.costGp).toBe(15)
    expect(meta.damage).toBe('1d8 slashing')
    // Bare 'Versatile' replaced in place by the enriched label — no duplicate.
    expect(meta.properties).toEqual(['Versatile (1d10)'])
  })

  it('maps a thrown finesse weapon (dagger) without duplicating Thrown', () => {
    const meta = normalizeFromSrd({
      equipment_categories: [
        { index: 'simple-melee-weapons', name: 'Simple Melee Weapons' },
        { index: 'weapons', name: 'Weapons' },
      ],
      cost: { quantity: 2, unit: 'gp' },
      damage: { damage_dice: '1d4', damage_type: { name: 'Piercing' } },
      range: { normal: 5 },
      throw_range: { normal: 20, long: 60 },
      weight: 1,
      properties: [{ name: 'Finesse' }, { name: 'Light' }, { name: 'Thrown' }],
    })

    expect(meta.itemType).toBe('Weapon')
    expect(meta.itemSubtype).toBe('Simple Melee')
    expect(meta.properties).toEqual(['Finesse', 'Light', 'Thrown (20/60)'])
  })

  it('maps light armor with merged armor class', () => {
    const meta = normalizeFromSrd({
      equipment_categories: [
        { index: 'armor', name: 'Armor' },
        { index: 'light-armor', name: 'Light Armor' },
      ],
      armor_class: { base: 11, dex_bonus: true },
      cost: { quantity: 10, unit: 'gp' },
      weight: 10,
      properties: [],
    })

    expect(meta.itemType).toBe('Armor')
    expect(meta.itemSubtype).toBe('Light Armor')
    expect(meta.properties).toEqual(['Light Armor (AC 11)'])
    expect(meta.damage).toBeUndefined()
  })

  it('reads 2024 `description` (array) as flavour text', () => {
    const meta = normalizeFromSrd({
      equipment_categories: [{ index: 'adventuring-gear', name: 'Adventuring Gear' }],
      description: ['A coil of hempen rope.', 'It has 2 hit points.'],
      weight: 5,
    })

    expect(meta.itemType).toBe('Adventuring Gear')
    expect(meta.description).toBe('A coil of hempen rope.\nIt has 2 hit points.')
  })
})

describe('normalizeFromSrd — 2014 schema (unchanged)', () => {
  it('maps a longsword from the 2014 fields', () => {
    const meta = normalizeFromSrd({
      equipment_category: { name: 'Weapon' },
      weapon_category: 'Martial',
      cost: { quantity: 15, unit: 'gp' },
      damage: { damage_dice: '1d8', damage_type: { name: 'Slashing' } },
      weight: 3,
      desc: ['A classic blade.'],
      properties: [{ name: 'Versatile' }],
      two_handed_damage: { damage_dice: '1d10' },
    })

    expect(meta.itemType).toBe('Weapon')
    expect(meta.itemSubtype).toBe('Martial')
    expect(meta.damage).toBe('1d8 slashing')
    expect(meta.description).toBe('A classic blade.')
    expect(meta.properties).toEqual(['Versatile (1d10)'])
  })

  it('flags a genuinely ranged weapon with a Range pill', () => {
    const meta = normalizeFromSrd({
      equipment_category: { name: 'Weapon' },
      weapon_category: 'Martial',
      range: { normal: 150, long: 600 },
      properties: [{ name: 'Ammunition' }, { name: 'Heavy' }, { name: 'Two-Handed' }],
    })

    expect(meta.properties).toEqual(['Ammunition', 'Heavy', 'Two-Handed', 'Range (150/600)'])
  })
})
