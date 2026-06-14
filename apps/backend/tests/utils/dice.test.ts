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
})
