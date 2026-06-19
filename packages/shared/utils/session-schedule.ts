/**
 * Session schedule utilities.
 * Pure, side-effect-free functions for computing recurrence labels and next occurrences.
 * Timezone-aware via date-fns-tz. Used by both backend (auto-advance on SESSION:ENDED)
 * and frontend (live label preview in SessionSchedulePicker).
 *
 * Implementation note: all intermediate date arithmetic is done via toZonedTime /
 * fromZonedTime so that results are correct regardless of the Node process timezone.
 * Avoid date-fns helpers that rely on local system time (startOfDay, setDay etc.)
 * unless the input has already been through toZonedTime.
 */

import { addDays, addWeeks } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { SessionScheduleType } from '../types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const NTH_LABELS = ['', '1st', '2nd', '3rd', '4th'] as const

export interface SessionSchedule {
  type: SessionScheduleType
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number
  /** 1–4; only used for MONTHLY_NTH */
  nth?: number
  /** 0–23 local hour */
  hour: number
  /** 0–59 local minute */
  minute: number
  /** IANA timezone string, e.g. "America/New_York" */
  timezone: string
}

/** Returns a human-readable recurrence label, e.g. "Every 2nd Sunday of the month at 1:00 PM". */
export function formatScheduleLabel(schedule: SessionSchedule): string {
  const { type, dayOfWeek, nth, hour, minute, timezone } = schedule
  const day = DAY_NAMES[dayOfWeek] ?? 'Sunday'

  const periodLabel = hour < 12 ? 'AM' : 'PM'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const minStr = String(minute).padStart(2, '0')
  const timeStr = `${h12}:${minStr} ${periodLabel}`

  const tzShort = timezone.split('/').pop()?.replace('_', ' ') ?? timezone

  switch (type) {
    case SessionScheduleType.WEEKLY:
      return `Every ${day} at ${timeStr} (${tzShort})`
    case SessionScheduleType.BIWEEKLY:
      return `Every other ${day} at ${timeStr} (${tzShort})`
    case SessionScheduleType.MONTHLY_NTH: {
      const nthLabel = NTH_LABELS[nth ?? 1] ?? '1st'
      return `Every ${nthLabel} ${day} of the month at ${timeStr} (${tzShort})`
    }
  }
}

/**
 * Calculates the next occurrence of a schedule strictly after `after`.
 * Returns the UTC Date of the next occurrence.
 */
export function calculateNextOccurrence(schedule: SessionSchedule, after: Date): Date {
  switch (schedule.type) {
    case SessionScheduleType.WEEKLY:
      return _nextWeekly(schedule, after, 1)
    case SessionScheduleType.BIWEEKLY:
      return _nextWeekly(schedule, after, 2)
    case SessionScheduleType.MONTHLY_NTH:
      return _nextMonthlyNth(schedule, after)
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a UTC Date for a given calendar day (in the target timezone) at hour:minute.
 * Reads year/month/day from the toZonedTime result's LOCAL getters (which are correct
 * for the target timezone), then passes through fromZonedTime to get the UTC instant.
 * This is safe regardless of the process's TZ environment variable.
 */
function _applyTime(date: Date, hour: number, minute: number, timezone: string): Date {
  const zoned = toZonedTime(date, timezone)
  // zoned.getFullYear/Month/Date() return the date's values in the target timezone
  const year = zoned.getFullYear()
  const month = zoned.getMonth()
  const day = zoned.getDate()
  // Build a plain Date with those calendar values and fromZonedTime converts to UTC
  return fromZonedTime(new Date(year, month, day, hour, minute, 0, 0), timezone)
}

function _nextWeekly(schedule: SessionSchedule, after: Date, stepWeeks: number): Date {
  const { dayOfWeek, hour, minute, timezone } = schedule
  const zonedAfter = toZonedTime(after, timezone)

  // Day of week in the target timezone
  const currentDay = zonedAfter.getDay()
  let daysUntil = dayOfWeek - currentDay
  if (daysUntil < 0) daysUntil += 7

  // Build the candidate time directly in the target timezone using the calendar
  // year/month/day from toZonedTime (safe regardless of process TZ).
  // new Date(y, m, d+offset) handles month/year overflow correctly.
  const y = zonedAfter.getFullYear()
  const mo = zonedAfter.getMonth()
  const d = zonedAfter.getDate()

  const result = fromZonedTime(new Date(y, mo, d + daysUntil, hour, minute, 0, 0), timezone)

  // Same weekday but the target time has already passed → advance by stepWeeks
  if (result <= after) {
    return fromZonedTime(new Date(y, mo, d + daysUntil + 7 * stepWeeks, hour, minute, 0, 0), timezone)
  }
  return result
}

function _nextMonthlyNth(schedule: SessionSchedule, after: Date): Date {
  const { dayOfWeek, nth = 1, hour, minute, timezone } = schedule

  for (let monthOffset = 0; monthOffset <= 13; monthOffset++) {
    const candidate = _nthWeekdayOfMonth(
      toZonedTime(after, timezone),
      dayOfWeek,
      nth,
      monthOffset,
      timezone,
    )
    if (!candidate) continue
    const result = _applyTime(candidate, hour, minute, timezone)
    if (result > after) return result
  }

  throw new Error(`calculateNextOccurrence: could not find monthly occurrence for ${JSON.stringify(schedule)}`)
}

/**
 * Returns the nth occurrence of `dayOfWeek` in the month that is `monthOffset`
 * months away from `zonedBase`. Returns null if that month has fewer than `nth` occurrences.
 *
 * All arithmetic is anchored in `timezone` via fromZonedTime / toZonedTime so the
 * result is correct regardless of the process's TZ environment variable.
 */
function _nthWeekdayOfMonth(
  zonedBase: Date,
  dayOfWeek: number,
  nth: number,
  monthOffset: number,
  timezone: string,
): Date | null {
  const year = zonedBase.getFullYear()
  const rawMonth = zonedBase.getMonth() + monthOffset

  // Normalise month overflow
  const targetYear = year + Math.floor(rawMonth / 12)
  const targetMonth = ((rawMonth % 12) + 12) % 12

  // First day of the target month at midnight in the target timezone → UTC
  // fromZonedTime reads the local getters of new Date(y, m, d, ...) which always
  // equal the passed values, then treats them as being in `timezone`.
  const firstOfMonth = fromZonedTime(new Date(targetYear, targetMonth, 1, 0, 0, 0, 0), timezone)

  // Day-of-week of the 1st, evaluated in the target timezone
  const firstDow = toZonedTime(firstOfMonth, timezone).getDay()

  let daysToFirst = dayOfWeek - firstDow
  if (daysToFirst < 0) daysToFirst += 7

  const firstOccurrence = addDays(firstOfMonth, daysToFirst)
  const nthOccurrence = addWeeks(firstOccurrence, nth - 1)

  // Verify we're still in the target month (in the target timezone)
  if (toZonedTime(nthOccurrence, timezone).getMonth() !== targetMonth) return null

  return nthOccurrence
}
