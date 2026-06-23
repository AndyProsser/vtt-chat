import { describe, expect, it } from 'vitest'
import { normalizeCharacterStats } from '@shared'

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
