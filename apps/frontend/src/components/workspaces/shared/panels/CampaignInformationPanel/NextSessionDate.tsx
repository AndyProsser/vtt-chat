/**
 * NextSessionDate leaf component.
 * Subscribes directly to the campaign schedule Zustand slice.
 * Renders only when no session is running (IDLE, ENDED, COOLDOWN, CLEANUP).
 * DM sees a pencil edit icon that opens an inline date/time override picker.
 */

import React, { useState, useCallback } from 'react'
import type { SessionLifecycleState, UUID } from '@shared'
import { SessionState } from '@shared'
import { useStore } from '@/hooks/useStore'
import { showToast } from '@/state/toastCenter'

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.trim() || window.location.origin

const VISIBLE_STATES = new Set<SessionLifecycleState | null | undefined>([
  SessionState.IDLE,
  SessionState.ENDED,
  SessionState.COOLDOWN,
  SessionState.CLEANUP,
  null,
  undefined,
])

/** Formats an ISO date string as "Sun Jun 15 at 7:00 PM · in 2 days". */
function formatNextDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / 86_400_000)

  const dateStr = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const timeStr = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  let relative: string
  if (diffDays < 0) {
    relative = 'overdue'
  } else if (diffDays === 0) {
    relative = 'today'
  } else if (diffDays === 1) {
    relative = 'tomorrow'
  } else {
    relative = `in ${diffDays} days`
  }

  return `${dateStr} at ${timeStr} · ${relative}`
}

export interface NextSessionDateProps {
  campaignId: UUID
  sessionState?: SessionLifecycleState | null
  canEdit?: boolean
}

export const NextSessionDate = React.memo(function NextSessionDate({
  campaignId,
  sessionState,
  canEdit = false,
}: NextSessionDateProps) {
  const scheduleState = useStore((s) => s.campaignSchedules[campaignId])
  const [isEditing, setIsEditing] = useState(false)
  const [dateInput, setDateInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Only render when no session is actively running
  if (!VISIBLE_STATES.has(sessionState)) return null
  if (!scheduleState?.nextSessionDate && !canEdit) return null

  const handleOverrideSave = useCallback(async () => {
    if (!dateInput) return
    setIsSaving(true)
    try {
      const token = sessionStorage.getItem('authToken') ?? ''
      const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/next-session-date`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ date: new Date(dateInput).toISOString() }),
      })
      if (!res.ok) throw new Error('Failed to save date override')
      setIsEditing(false)
      showToast({ message: 'Next session date updated.', variant: 'success', durationMs: 3000 })
    } catch {
      showToast({ message: 'Failed to update date.', variant: 'error', durationMs: 5000 })
    } finally {
      setIsSaving(false)
    }
  }, [campaignId, dateInput])

  const handleRevertToSchedule = useCallback(async () => {
    if (!scheduleState?.scheduleLabel) return
    setIsSaving(true)
    try {
      // Clearing and re-setting the schedule recalculates nextSessionDate from the rule.
      // We POST to settings with the existing schedule to trigger a recalculate.
      const token = sessionStorage.getItem('authToken') ?? ''
      const res = await fetch(`${API_URL}/api/campaigns/${campaignId}/next-session-date`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      // 404 is fine — no manual override to clear
      if (!res.ok && res.status !== 404 && res.status !== 204) throw new Error()
      setIsEditing(false)
      showToast({ message: 'Reverted to schedule.', variant: 'info', durationMs: 3000 })
    } catch {
      showToast({ message: 'Failed to revert.', variant: 'error', durationMs: 5000 })
    } finally {
      setIsSaving(false)
    }
  }, [campaignId, scheduleState?.scheduleLabel])

  return (
    <div className="nsd-container">
      <div className="nsd-row">
        <span className="nsd-icon material-symbols-outlined" aria-hidden="true">
          event
        </span>
        <div className="nsd-content">
          <span className="nsd-header-label">Next Session</span>
          <div className="nsd-date-row">
            {scheduleState?.nextSessionDate ? (
              <span className="nsd-date">{formatNextDate(scheduleState.nextSessionDate)}</span>
            ) : (
              <span className="nsd-no-date">No next session scheduled</span>
            )}
            {scheduleState?.nextSessionIsManual && (
              <span className="nsd-manual-badge">override</span>
            )}
          </div>
          {scheduleState?.scheduleLabel && (
            <span className="nsd-label">{scheduleState.scheduleLabel}</span>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            className="nsd-edit-btn session-icon-action session-icon-action--icon"
            aria-label="Edit next session date"
            onClick={() => setIsEditing((v) => !v)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              edit
            </span>
          </button>
        )}
      </div>

      {isEditing && canEdit && (
        <div className="nsd-editor">
          <input
            type="datetime-local"
            className="nsd-datetime-input"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            disabled={isSaving}
            aria-label="Override next session date and time"
          />
          <div className="nsd-editor-actions">
            <button
              type="button"
              className="session-icon-action session-icon-action--text"
              onClick={handleOverrideSave}
              disabled={isSaving || !dateInput}
            >
              {isSaving ? 'Saving…' : 'Save override'}
            </button>
            {scheduleState?.scheduleLabel && scheduleState.nextSessionIsManual && (
              <button
                type="button"
                className="session-icon-action session-icon-action--text"
                onClick={handleRevertToSchedule}
                disabled={isSaving}
              >
                Revert to schedule
              </button>
            )}
            <button
              type="button"
              className="session-icon-action session-icon-action--text"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
