/**
 * Campaign Schedule Slice (Zustand)
 * Tracks the next session date and recurrence schedule label per campaign.
 * Updated via CAMPAIGN:SCHEDULE_UPDATED events and hydrated from the settings API.
 */

import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'

export interface CampaignScheduleState {
  /** ISO-8601 UTC string, or null if not set */
  nextSessionDate: string | null
  /** Human-readable label from formatScheduleLabel, or null if no recurrence rule */
  scheduleLabel: string | null
  /** True when nextSessionDate was set by a DM manual override */
  nextSessionIsManual: boolean
}

export interface CampaignScheduleSlice {
  /** Per-campaign schedule state, keyed by campaignId */
  campaignSchedules: Record<UUID, CampaignScheduleState>

  // Actions
  setCampaignSchedule: (campaignId: UUID, state: CampaignScheduleState) => void
  clearCampaignSchedule: (campaignId: UUID) => void

  // WS event handler
  handleCampaignScheduleUpdated: (event: EventEnvelope) => void
}

export const createCampaignScheduleSlice: StateCreator<CampaignScheduleSlice> = (set) => ({
  campaignSchedules: {},

  setCampaignSchedule: (campaignId, scheduleState) =>
    set((state) => ({
      campaignSchedules: {
        ...state.campaignSchedules,
        [campaignId]: scheduleState,
      },
    })),

  clearCampaignSchedule: (campaignId) =>
    set((state) => {
      const next = { ...state.campaignSchedules }
      delete next[campaignId]
      return { campaignSchedules: next }
    }),

  handleCampaignScheduleUpdated: (event) => {
    const payload = event.payload as {
      campaignId: UUID
      nextSessionDate: string | null
      scheduleLabel: string | null
      nextSessionIsManual: boolean
    }
    if (!payload?.campaignId) return
    set((state) => ({
      campaignSchedules: {
        ...state.campaignSchedules,
        [payload.campaignId]: {
          nextSessionDate: payload.nextSessionDate,
          scheduleLabel: payload.scheduleLabel,
          nextSessionIsManual: payload.nextSessionIsManual,
        },
      },
    }))
  },
})
