/**
 * SessionSchedulePicker
 * Lets the DM configure a repeating session schedule (weekly, biweekly, monthly-nth)
 * and preview the human-readable label before saving.
 * Calls PATCH /api/campaigns/:id/settings with the sessionSchedule payload,
 * or DELETE /api/campaigns/:id/schedule to clear.
 */

import { useState, useEffect, useCallback } from 'react'
import { SessionScheduleType, formatScheduleLabel } from '@shared'
import type { SessionSchedule } from '@shared'
import type { UUID } from '@shared'
import { useStore } from '@/hooks/useStore'
import { showToast } from '@/state/toastCenter'
import '@/styles/components/workspaces/shared/panels/SessionSchedulePicker.css'

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() || window.location.origin

const DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const NTH_OPTIONS = [
  { value: 1, label: '1st' },
  { value: 2, label: '2nd' },
  { value: 3, label: '3rd' },
  { value: 4, label: '4th' },
]

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 15, 30, 45]

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00 ${period}`
}

/** Attempts to detect the user's IANA timezone. Falls back to UTC. */
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export interface SessionSchedulePickerProps {
  campaignId: UUID
}

export function SessionSchedulePicker({ campaignId }: SessionSchedulePickerProps) {
  const scheduleState = useStore((s) => s.campaignSchedules[campaignId])

  // Derive initial values from Zustand or fallback defaults
  const [scheduleType, setScheduleType] = useState<SessionScheduleType>(
    SessionScheduleType.WEEKLY,
  )
  const [dayOfWeek, setDayOfWeek] = useState(6) // Saturday
  const [nth, setNth] = useState(1)
  const [hour, setHour] = useState(19) // 7 PM
  const [minute, setMinute] = useState(0)
  const [timezone, setTimezone] = useState(detectTimezone)
  const [isSaving, setIsSaving] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [hasSchedule, setHasSchedule] = useState(false)

  // Sync from server state when it loads
  useEffect(() => {
    if (scheduleState?.scheduleLabel) {
      setHasSchedule(true)
    }
  }, [scheduleState])

  const buildSchedule = useCallback((): SessionSchedule => ({
    type: scheduleType,
    dayOfWeek,
    nth: scheduleType === SessionScheduleType.MONTHLY_NTH ? nth : undefined,
    hour,
    minute,
    timezone,
  }), [scheduleType, dayOfWeek, nth, hour, minute, timezone])

  const previewLabel = formatScheduleLabel(buildSchedule())

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const token = sessionStorage.getItem('authToken') ?? ''
      const schedule = buildSchedule()
      const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionSchedule: schedule }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message ?? 'Failed to save schedule')
      }
      setHasSchedule(true)
      showToast({ message: 'Schedule saved.', variant: 'success', durationMs: 3000 })
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Failed to save schedule.',
        variant: 'error',
        durationMs: 5000,
      })
    } finally {
      setIsSaving(false)
    }
  }, [campaignId, buildSchedule])

  const handleClear = useCallback(async () => {
    setIsClearing(true)
    try {
      const token = sessionStorage.getItem('authToken') ?? ''
      const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/schedule`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok && res.status !== 204) {
        throw new Error('Failed to clear schedule')
      }
      setHasSchedule(false)
      showToast({ message: 'Schedule cleared.', variant: 'info', durationMs: 3000 })
    } catch (err) {
      showToast({
        message: err instanceof Error ? err.message : 'Failed to clear schedule.',
        variant: 'error',
        durationMs: 5000,
      })
    } finally {
      setIsClearing(false)
    }
  }, [campaignId])

  return (
    <div className="ssp-container">
      <div className="ssp-row">
        <label className="ssp-label" htmlFor="ssp-type">Repeats</label>
        <select
          id="ssp-type"
          className="ssp-select"
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as SessionScheduleType)}
          disabled={isSaving}
        >
          <option value={SessionScheduleType.WEEKLY}>Weekly</option>
          <option value={SessionScheduleType.BIWEEKLY}>Every 2 weeks</option>
          <option value={SessionScheduleType.MONTHLY_NTH}>Monthly (Nth weekday)</option>
        </select>
      </div>

      {scheduleType === SessionScheduleType.MONTHLY_NTH && (
        <div className="ssp-row">
          <label className="ssp-label" htmlFor="ssp-nth">Week</label>
          <select
            id="ssp-nth"
            className="ssp-select"
            value={nth}
            onChange={(e) => setNth(Number(e.target.value))}
            disabled={isSaving}
          >
            {NTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="ssp-row">
        <label className="ssp-label" htmlFor="ssp-day">Day</label>
        <select
          id="ssp-day"
          className="ssp-select"
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(Number(e.target.value))}
          disabled={isSaving}
        >
          {DAY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="ssp-row">
        <label className="ssp-label" htmlFor="ssp-hour">Time</label>
        <div className="ssp-time-group">
          <select
            id="ssp-hour"
            className="ssp-select ssp-select--time"
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            disabled={isSaving}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>{formatHour(h)}</option>
            ))}
          </select>
          <select
            id="ssp-minute"
            className="ssp-select ssp-select--time"
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            disabled={isSaving}
            aria-label="Minutes"
          >
            {MINUTES.map((m) => (
              <option key={m} value={m}>:{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="ssp-row">
        <label className="ssp-label" htmlFor="ssp-tz">Timezone</label>
        <input
          id="ssp-tz"
          className="ssp-input"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          disabled={isSaving}
          placeholder="e.g. America/New_York"
          spellCheck={false}
        />
      </div>

      <div className="ssp-preview">
        <span className="ssp-preview-label">Preview:</span>
        <span className="ssp-preview-value">{previewLabel}</span>
      </div>

      <div className="ssp-actions">
        <button
          type="button"
          className="session-icon-action session-icon-action--text"
          onClick={handleSave}
          disabled={isSaving || isClearing}
        >
          {isSaving ? 'Saving…' : 'Set Schedule'}
        </button>
        {hasSchedule && (
          <button
            type="button"
            className="session-icon-action session-icon-action--text session-icon-action--danger"
            onClick={handleClear}
            disabled={isSaving || isClearing}
          >
            {isClearing ? 'Clearing…' : 'Clear Schedule'}
          </button>
        )}
      </div>

      {scheduleState?.nextSessionDate && (
        <p className="ssp-current">
          Current: <strong>{scheduleState.scheduleLabel ?? 'Manual override'}</strong>
          {scheduleState.nextSessionIsManual && <span className="ssp-manual-badge"> (manual)</span>}
        </p>
      )}
    </div>
  )
}
