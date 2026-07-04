import { describe, it, expect } from 'vitest'
import { SessionScheduleType } from '@shared'
import { formatScheduleLabel, calculateNextOccurrence } from '@shared'
import type { SessionSchedule } from '@shared'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSchedule(overrides: Partial<SessionSchedule> = {}): SessionSchedule {
  return {
    type: SessionScheduleType.WEEKLY,
    dayOfWeek: 6, // Saturday
    hour: 19,
    minute: 0,
    timezone: 'UTC',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// formatScheduleLabel
// ---------------------------------------------------------------------------

describe('formatScheduleLabel', () => {
  it('formats a weekly schedule', () => {
    const label = formatScheduleLabel(makeSchedule())
    expect(label).toMatch(/Every Saturday/)
    expect(label).toMatch(/7:00 PM/)
    expect(label).toMatch(/UTC/)
  })

  it('formats a biweekly schedule', () => {
    const label = formatScheduleLabel(
      makeSchedule({ type: SessionScheduleType.BIWEEKLY, dayOfWeek: 0 })
    )
    expect(label).toMatch(/every other Sunday/i)
  })

  it('formats a monthly-Nth schedule', () => {
    const label = formatScheduleLabel(
      makeSchedule({ type: SessionScheduleType.MONTHLY_NTH, dayOfWeek: 0, nth: 2 })
    )
    expect(label).toMatch(/2nd Sunday/i)
    expect(label).toMatch(/month/)
  })

  it('uses 12-hour format with AM/PM', () => {
    const am = formatScheduleLabel(makeSchedule({ hour: 9, minute: 30 }))
    expect(am).toMatch(/9:30 AM/)
    const midnight = formatScheduleLabel(makeSchedule({ hour: 0, minute: 0 }))
    expect(midnight).toMatch(/12:00 AM/)
    const noon = formatScheduleLabel(makeSchedule({ hour: 12, minute: 0 }))
    expect(noon).toMatch(/12:00 PM/)
  })
})

// ---------------------------------------------------------------------------
// calculateNextOccurrence
// ---------------------------------------------------------------------------

describe('calculateNextOccurrence', () => {
  it('returns a date strictly after the reference date', () => {
    const after = new Date('2025-01-01T00:00:00Z')
    const next = calculateNextOccurrence(makeSchedule({ dayOfWeek: 6 }), after)
    expect(next.getTime()).toBeGreaterThan(after.getTime())
  })

  it('returns the correct weekday for weekly', () => {
    // Reference: Wednesday 2025-01-01 (day 3). Next Saturday should be 2025-01-04.
    const after = new Date('2025-01-01T00:00:00Z')
    const next = calculateNextOccurrence(
      makeSchedule({ dayOfWeek: 6, hour: 19, minute: 0, timezone: 'UTC' }),
      after
    )
    expect(next.getUTCDay()).toBe(6) // Saturday
    expect(next.getUTCHours()).toBe(19)
  })

  it('advances by 2 weeks for biweekly', () => {
    // Reference: Saturday 2025-01-04. Next biweekly Saturday should be 2025-01-18.
    const after = new Date('2025-01-04T20:00:00Z') // past 19:00 so next occurrence is 2 weeks ahead
    const next = calculateNextOccurrence(
      makeSchedule({
        type: SessionScheduleType.BIWEEKLY,
        dayOfWeek: 6,
        hour: 19,
        minute: 0,
        timezone: 'UTC',
      }),
      after
    )
    expect(next.getUTCDay()).toBe(6)
    const diffDays = Math.round((next.getTime() - after.getTime()) / 86_400_000)
    expect(diffDays).toBeGreaterThanOrEqual(14)
  })

  it('returns the correct Nth weekday of month for MONTHLY_NTH', () => {
    // 2nd Sunday of January 2025 is 2025-01-12
    const after = new Date('2025-01-01T00:00:00Z')
    const next = calculateNextOccurrence(
      makeSchedule({
        type: SessionScheduleType.MONTHLY_NTH,
        dayOfWeek: 0,
        nth: 2,
        hour: 19,
        minute: 0,
        timezone: 'UTC',
      }),
      after
    )
    expect(next.getUTCDay()).toBe(0) // Sunday
    expect(next.getUTCDate()).toBe(12)
    expect(next.getUTCMonth()).toBe(0) // January
  })

  it('skips to next month if Nth weekday has already passed', () => {
    // 2nd Sunday of January 2025 was 2025-01-12. After that, it should go to 2025-02-09.
    const after = new Date('2025-01-12T20:00:00Z')
    const next = calculateNextOccurrence(
      makeSchedule({
        type: SessionScheduleType.MONTHLY_NTH,
        dayOfWeek: 0,
        nth: 2,
        hour: 19,
        minute: 0,
        timezone: 'UTC',
      }),
      after
    )
    expect(next.getUTCDay()).toBe(0) // Sunday
    expect(next.getUTCMonth()).toBe(1) // February
    expect(next.getUTCDate()).toBe(9)
  })

  it('handles timezone offset correctly', () => {
    // America/New_York is UTC-5 in January (EST)
    // Asking for 19:00 ET means 00:00 UTC next day
    const after = new Date('2025-01-01T00:00:00Z')
    const next = calculateNextOccurrence(
      makeSchedule({ dayOfWeek: 6, hour: 19, minute: 0, timezone: 'America/New_York' }),
      after
    )
    // Should resolve to Saturday 2025-01-04 at 19:00 ET = 2025-01-05T00:00:00Z
    expect(next.getUTCDay()).toBe(0) // 00:00 UTC Sunday = Saturday night ET ✓
    expect(next.getUTCHours()).toBe(0)
  })
})
