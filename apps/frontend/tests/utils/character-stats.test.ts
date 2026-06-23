import { describe, expect, it } from 'vitest'
import { mergeCharacterMetadata, normalizeCharacterStats } from '@shared'

/**
 * normalizeCharacterStats is the single source of truth for character-stats shape.
 * It must collapse every historical input form into ONE canonical flat object so
 * mock players, extension-synced players, live presence and the offline party
 * snapshot all render identically.
 */
describe('normalizeCharacterStats', () => {
  it('returns null for empty / invalid input', () => {
    expect(normalizeCharacterStats(null)).toBeNull()
    expect(normalizeCharacterStats(undefined)).toBeNull()
    expect(normalizeCharacterStats('nope')).toBeNull()
    expect(normalizeCharacterStats([])).toBeNull()
    expect(normalizeCharacterStats({})).toBeNull()
  })

  it('passes through the mock / legacy flat shape unchanged', () => {
    const flat = {
      level: 5,
      proficiencyBonus: 3,
      strength: 14,
      dexterity: 16,
      constitution: 12,
      intelligence: 10,
      wisdom: 13,
      charisma: 8,
      hpCurrent: 22,
      hpMax: 40,
      ac: 16,
      initiative: 3,
      passivePerception: 13,
      speed: 30,
    }
    expect(normalizeCharacterStats(flat)).toMatchObject(flat)
  })

  it('transforms the raw extension stats payload (abilityScores + hp nesting)', () => {
    const extensionStats = {
      initiative: 3,
      proficiencyBonus: 2,
      passivePerception: 14,
      abilityScores: { str: 10, dex: 16, con: 10, int: 8, wis: 14, cha: 17 },
      hp: { current: 23, max: 23, temp: 0 },
      ac: 14,
      speed: 30,
    }

    expect(normalizeCharacterStats(extensionStats)).toMatchObject({
      strength: 10,
      dexterity: 16,
      constitution: 10,
      intelligence: 8,
      wisdom: 14,
      charisma: 17,
      hpCurrent: 23,
      hpMax: 23,
      hpTemp: 0,
      ac: 14,
      initiative: 3,
      passivePerception: 14,
      proficiencyBonus: 2,
      speed: 30,
    })
  })

  it('transforms extension-stored metadata (stats nested under `stats`)', () => {
    const metadata = {
      level: 7,
      characterUrl: 'https://example.com/1',
      stats: {
        abilityScores: { str: 10, dex: 16, con: 10, int: 8, wis: 14, cha: 17 },
        hp: { current: 5, max: 23, temp: 0 },
        ac: 14,
      },
      conditions: [],
      features: ['Action Surge'],
    }

    expect(normalizeCharacterStats(metadata)).toMatchObject({
      level: 7,
      strength: 10,
      charisma: 17,
      hpCurrent: 5,
      hpMax: 23,
      ac: 14,
    })
    // Non-stat metadata keys are dropped from the canonical stats object.
    const result = normalizeCharacterStats(metadata)!
    expect(result.characterUrl).toBeUndefined()
    expect(result.features).toBeUndefined()
  })

  it('is idempotent — normalizing canonical output yields the same shape', () => {
    const metadata = {
      stats: { abilityScores: { str: 10, dex: 16, con: 10, int: 8, wis: 14, cha: 17 } },
    }
    const once = normalizeCharacterStats(metadata)
    const twice = normalizeCharacterStats(once)
    expect(twice).toEqual(once)
  })

  it('prefers nested extension values over flat siblings when both exist', () => {
    const mixed = {
      strength: 99,
      stats: { abilityScores: { str: 10 } },
    }
    expect(normalizeCharacterStats(mixed)?.strength).toBe(10)
  })
})

/**
 * mergeCharacterMetadata is the single source-of-truth overwrite used by both the
 * sync API and guest-auth ingestion. The extension overwrites; absent sections are
 * preserved so the extension's multi-packet (first packet often stats-less) cadence
 * never wipes previously-synced data.
 */
describe('mergeCharacterMetadata', () => {
  const extensionStats = {
    abilityScores: { str: 10, dex: 16, con: 10, int: 8, wis: 14, cha: 17 },
    hp: { current: 23, max: 23, temp: 0 },
    ac: 14,
  }

  it('overwrites the stats section, dropping stale flat keys and legacy nested `stats`', () => {
    const existing = {
      level: 1,
      strength: 99, // stale, must be overwritten
      hpTemp: 50, // stale and absent from the new payload, must be removed
      stats: { abilityScores: { str: 99 } }, // legacy nested, must be dropped
    }

    const result = mergeCharacterMetadata(existing, { level: 4, stats: extensionStats })

    expect(result).toMatchObject({ level: 4, strength: 10, dexterity: 16, hpCurrent: 23, ac: 14 })
    expect(result.hpTemp).toBe(0) // from payload hp.temp, not the stale 50
    expect(result.stats).toBeUndefined()
  })

  it('preserves the existing stats section when the packet omits stats', () => {
    const existing = { level: 4, strength: 10, dexterity: 16, hpCurrent: 23 }
    const result = mergeCharacterMetadata(existing, { level: 4, characterUrl: 'https://x/1' })
    expect(result).toMatchObject({
      level: 4,
      strength: 10,
      dexterity: 16,
      hpCurrent: 23,
      characterUrl: 'https://x/1',
    })
  })

  it('does not wipe stats when given an empty/invalid stats object', () => {
    const existing = { strength: 10, dexterity: 16 }
    expect(mergeCharacterMetadata(existing, { stats: {} })).toMatchObject({
      strength: 10,
      dexterity: 16,
    })
    expect(mergeCharacterMetadata(existing, { stats: { abilityScores: {} } })).toMatchObject({
      strength: 10,
      dexterity: 16,
    })
  })

  it('overwrites conditions and features only when provided', () => {
    const existing = { conditions: ['old'], features: ['Old Feature'] }
    expect(mergeCharacterMetadata(existing, { features: ['New Feature'] })).toEqual({
      conditions: ['old'],
      features: ['New Feature'],
    })
  })

  it('builds fresh metadata from null/undefined existing', () => {
    expect(mergeCharacterMetadata(null, { level: 4, stats: extensionStats })).toMatchObject({
      level: 4,
      strength: 10,
      ac: 14,
    })
  })
})
