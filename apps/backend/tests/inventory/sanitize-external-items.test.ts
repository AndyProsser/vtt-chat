/**
 * Unit tests for sanitizeExternalItems — verifies that extension (DDB) import
 * data is normalized into the same canonical ItemMetadata structure as SRD items,
 * so the frontend renders any source identically.
 */

import { describe, it, expect } from 'vitest'
import { sanitizeExternalItems } from '@/services/integration-sync-policy.service'

describe('sanitizeExternalItems — DDB metadata normalization', () => {
  it('maps DDB extended fields into canonical item metadata', () => {
    const [item] = sanitizeExternalItems([
      {
        externalId: 'ddb-item-456',
        name: 'Longsword',
        quantity: 1,
        srdKey: 'longsword',
        srdCategory: 'EQUIPMENT',
        weight: 3,
        itemType: 'Weapon',
        itemSubtype: 'Martial Melee',
        costGp: 15,
        damage: '1d8 slashing',
        properties: ['Versatile (1d10)'],
        description: 'A versatile blade.',
      },
    ])

    expect(item.metadata).toEqual({
      itemType: 'Weapon',
      itemSubtype: 'Martial Melee',
      weight: 3,
      costGp: 15,
      damage: '1d8 slashing',
      properties: ['Versatile (1d10)'],
      description: 'A versatile blade.',
    })
  })

  it('leaves metadata undefined when no extended fields are present', () => {
    const [item] = sanitizeExternalItems([
      { externalId: 'ddb-item-789', name: 'Mystery Trinket', quantity: 2 },
    ])

    // undefined → upsert won't overwrite previously-stored metadata
    expect(item.metadata).toBeUndefined()
  })

  it('accepts DDB properties as {name} objects, not just strings', () => {
    const [item] = sanitizeExternalItems([
      {
        externalId: 'ddb-item-1',
        name: 'Dagger',
        quantity: 1,
        properties: [{ name: 'Finesse' }, { name: 'Light' }, { name: 'Thrown' }],
      },
    ])

    expect(item.metadata?.properties).toEqual(['Finesse', 'Light', 'Thrown'])
  })

  it('strips HTML from DDB descriptions, preserving paragraph breaks', () => {
    const [item] = sanitizeExternalItems([
      {
        externalId: 'ddb-item-2',
        name: 'Dagger',
        quantity: 1,
        description: '<p>Proficiency with a Dagger lets you add your bonus.</p><p>Second &amp; line.</p>',
      },
    ])

    expect(item.metadata?.description).toBe(
      'Proficiency with a Dagger lets you add your bonus.\nSecond & line.'
    )
  })

  it('drops malformed extended values rather than storing junk', () => {
    const [item] = sanitizeExternalItems([
      {
        id: 12345, // numeric DDB id, no externalId
        name: 'Dagger',
        quantity: 1,
        weight: 'heavy', // wrong type — ignored
        properties: ['Finesse', 42, 'Light'], // non-strings filtered out
      },
    ])

    expect(item.externalId).toBe('12345')
    expect(item.metadata).toEqual({ properties: ['Finesse', 'Light'] })
  })
})
