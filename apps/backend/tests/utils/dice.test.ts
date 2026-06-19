/**
 * Dice Roller Unit Tests
 * Validates parsing, boundary enforcement, and roll distribution.
 */

import { describe, it, expect } from 'vitest'
import { parseDiceExpression, rollDice, executeDiceRoll } from '@/utils/dice'

describe('parseDiceExpression', () => {
  it('parses a simple die with no modifier', () => {
    const result = parseDiceExpression('1d20')
    expect(result).not.toBeNull()
    expect(result!.count).toBe(1)
    expect(result!.sides).toBe(20)
    expect(result!.modifier).toBe(0)
    expect(result!.expression).toBe('1d20')
  })

  it('parses dice with a positive modifier', () => {
    const result = parseDiceExpression('2d6+3')
    expect(result).not.toBeNull()
    expect(result!.count).toBe(2)
    expect(result!.sides).toBe(6)
    expect(result!.modifier).toBe(3)
    expect(result!.expression).toBe('2d6+3')
  })

  it('parses dice with a negative modifier', () => {
    const result = parseDiceExpression('4d8-2')
    expect(result).not.toBeNull()
    expect(result!.count).toBe(4)
    expect(result!.sides).toBe(8)
    expect(result!.modifier).toBe(-2)
    expect(result!.expression).toBe('4d8-2')
  })

  it('is case-insensitive', () => {
    expect(parseDiceExpression('1D20')).not.toBeNull()
  })

  it('trims whitespace', () => {
    expect(parseDiceExpression('  2d6  ')).not.toBeNull()
  })

  it('rejects zero dice', () => {
    expect(parseDiceExpression('0d6')).toBeNull()
  })

  it('rejects a 1-sided die', () => {
    expect(parseDiceExpression('1d1')).toBeNull()
  })

  it('rejects too many dice', () => {
    expect(parseDiceExpression('101d6')).toBeNull()
  })

  it('rejects too many sides', () => {
    expect(parseDiceExpression('1d1001')).toBeNull()
  })

  it('rejects invalid notation', () => {
    expect(parseDiceExpression('20')).toBeNull()
    expect(parseDiceExpression('d20')).toBeNull()
    expect(parseDiceExpression('roll 1d20')).toBeNull()
    expect(parseDiceExpression('')).toBeNull()
  })

  it('parses ADVd20 as advantage with 2 dice', () => {
    const result = parseDiceExpression('ADVd20')
    expect(result).not.toBeNull()
    expect(result!.count).toBe(2)
    expect(result!.sides).toBe(20)
    expect(result!.advantage).toBe('ADV')
    expect(result!.expression).toBe('ADVd20')
  })

  it('parses DISd20 as disadvantage', () => {
    const result = parseDiceExpression('DISd20')
    expect(result).not.toBeNull()
    expect(result!.advantage).toBe('DIS')
    expect(result!.expression).toBe('DISd20')
  })

  it('parses short form Ad20 as advantage', () => {
    const result = parseDiceExpression('Ad20')
    expect(result).not.toBeNull()
    expect(result!.advantage).toBe('ADV')
  })

  it('parses short form Dd20 as disadvantage', () => {
    const result = parseDiceExpression('Dd20')
    expect(result).not.toBeNull()
    expect(result!.advantage).toBe('DIS')
  })

  it('parses ADV/DIS with a modifier', () => {
    const result = parseDiceExpression('ADVd20+5')
    expect(result).not.toBeNull()
    expect(result!.modifier).toBe(5)
    expect(result!.expression).toBe('ADVd20+5')
  })

  it('is case-insensitive for ADV/DIS', () => {
    expect(parseDiceExpression('advd20')).not.toBeNull()
    expect(parseDiceExpression('DISD12')).not.toBeNull()
  })
})

describe('executeDiceRoll', () => {
  it('returns the correct number of rolls', () => {
    const expr = parseDiceExpression('3d6')!
    const result = executeDiceRoll(expr)
    expect(result.rolls).toHaveLength(3)
  })

  it('rolls are within [1, sides]', () => {
    const expr = parseDiceExpression('10d6')!
    const result = executeDiceRoll(expr)
    for (const roll of result.rolls) {
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(6)
    }
  })

  it('applies the modifier correctly', () => {
    const expr = parseDiceExpression('1d6+10')!
    const result = executeDiceRoll(expr)
    const expectedTotal = result.rolls[0] + 10
    expect(result.total).toBe(expectedTotal)
    expect(result.modifier).toBe(10)
  })

  it('applies negative modifier correctly', () => {
    const expr = parseDiceExpression('1d6-3')!
    const result = executeDiceRoll(expr)
    expect(result.total).toBe(result.rolls[0] - 3)
  })

  it('returns total equal to sum of rolls plus modifier', () => {
    const expr = parseDiceExpression('4d8+5')!
    const result = executeDiceRoll(expr)
    const expected = result.rolls.reduce((a, b) => a + b, 0) + 5
    expect(result.total).toBe(expected)
  })
})

describe('executeDiceRoll — ADV/DIS', () => {
  it('ADV roll always keeps the highest die', () => {
    const expr = parseDiceExpression('ADVd20')!
    for (let i = 0; i < 20; i++) {
      const result = executeDiceRoll(expr)
      expect(result.rolls).toHaveLength(2)
      expect(result.advantage).toBe('ADV')
      expect(result.keptIndex).toBeDefined()
      expect(result.rolls[result.keptIndex!]).toBe(Math.max(...result.rolls))
      expect(result.total).toBe(result.rolls[result.keptIndex!])
    }
  })

  it('DIS roll always keeps the lowest die', () => {
    const expr = parseDiceExpression('DISd20')!
    for (let i = 0; i < 20; i++) {
      const result = executeDiceRoll(expr)
      expect(result.rolls[result.keptIndex!]).toBe(Math.min(...result.rolls))
      expect(result.total).toBe(result.rolls[result.keptIndex!])
    }
  })

  it('ADV roll applies modifier to kept die only', () => {
    const expr = parseDiceExpression('ADVd20+5')!
    const result = executeDiceRoll(expr)
    expect(result.total).toBe(result.rolls[result.keptIndex!] + 5)
  })
})

describe('rollDice', () => {
  it('returns null for invalid expression', () => {
    expect(rollDice('invalid')).toBeNull()
    expect(rollDice('')).toBeNull()
    expect(rollDice('0d6')).toBeNull()
  })

  it('returns a result for valid expression', () => {
    const result = rollDice('1d20')
    expect(result).not.toBeNull()
    expect(result!.total).toBeGreaterThanOrEqual(1)
    expect(result!.total).toBeLessThanOrEqual(20)
  })

  it('returns a result for ADVd20', () => {
    const result = rollDice('ADVd20')
    expect(result).not.toBeNull()
    expect(result!.advantage).toBe('ADV')
    expect(result!.rolls).toHaveLength(2)
  })
})
