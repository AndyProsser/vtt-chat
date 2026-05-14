import { describe, expect, it } from 'vitest'
import { formatTimestamp, formatDuration, truncateText, pluralize } from '../../src/utils/format'

describe('formatDuration', () => {
  it('returns "0s" for zero ms', () => {
    expect(formatDuration(0)).toBe('0s')
  })

  it('returns "0s" for negative ms', () => {
    expect(formatDuration(-1000)).toBe('0s')
  })

  it('formats seconds only', () => {
    expect(formatDuration(45000)).toBe('45s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s')
  })

  it('formats hours and minutes (omits seconds)', () => {
    expect(formatDuration(3661000)).toBe('1h 1m')
  })

  it('formats exactly 1 hour', () => {
    expect(formatDuration(3600000)).toBe('1h 0m')
  })
})

describe('truncateText', () => {
  it('returns text unchanged when shorter than maxLength', () => {
    expect(truncateText('hello', 10)).toBe('hello')
  })

  it('returns text unchanged when exactly at maxLength', () => {
    const text = 'a'.repeat(80)
    expect(truncateText(text)).toBe(text)
  })

  it('truncates and appends ellipsis when over maxLength', () => {
    const long = 'a'.repeat(100)
    const result = truncateText(long)
    // slice(0, 79).trimEnd() + '...' = 79 + 3 = 82 chars
    expect(result.length).toBeLessThan(long.length)
    expect(result.endsWith('...')).toBe(true)
  })

  it('respects custom maxLength', () => {
    const result = truncateText('hello world', 8)
    // slice(0, 7).trimEnd() + '...' → shorter than original
    expect(result.length).toBeLessThan('hello world'.length)
    expect(result.endsWith('...')).toBe(true)
  })
})

describe('pluralize', () => {
  it('returns singular when count is 1', () => {
    expect(pluralize(1, 'item')).toBe('item')
  })

  it('returns plural when count is 0', () => {
    expect(pluralize(0, 'item')).toBe('items')
  })

  it('returns plural when count is greater than 1', () => {
    expect(pluralize(5, 'item')).toBe('items')
  })

  it('uses custom plural form when provided', () => {
    expect(pluralize(2, 'mouse', 'mice')).toBe('mice')
    expect(pluralize(1, 'mouse', 'mice')).toBe('mouse')
  })
})

describe('formatTimestamp', () => {
  it('returns a non-empty string for a valid timestamp', () => {
    const result = formatTimestamp(1700000000000)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes year in output', () => {
    const ts = new Date('2024-01-15T12:00:00Z').getTime()
    const result = formatTimestamp(ts, 'en-US')
    expect(result).toContain('2024')
  })
})
