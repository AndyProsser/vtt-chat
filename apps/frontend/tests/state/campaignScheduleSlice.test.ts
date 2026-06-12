import { beforeEach, describe, it, expect } from 'vitest'
import type { UUID } from '@shared'
import { useStore } from '@/state/store'

const CAMPAIGN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID

const makeEvent = (payload: object) => ({
  id: '11111111-1111-4111-8111-111111111111' as UUID,
  type: 'CAMPAIGN:SCHEDULE_UPDATED',
  version: 1,
  userId: '22222222-2222-4222-8222-222222222222' as UUID,
  userRole: 'DM' as const,
  sessionId: null as unknown as UUID,
  roomId: null,
  timestamp: Date.now(),
  payload,
})

describe('campaignScheduleSlice', () => {
  beforeEach(() => {
    useStore.setState({ campaignSchedules: {} })
  })

  it('sets schedule state from CAMPAIGN:SCHEDULE_UPDATED event', () => {
    useStore.getState().handleCampaignScheduleUpdated(
      makeEvent({
        campaignId: CAMPAIGN_ID,
        nextSessionDate: '2025-06-15T00:00:00.000Z',
        scheduleLabel: 'Every Saturday at 7:00 PM (UTC)',
        nextSessionIsManual: false,
      }),
    )

    const state = useStore.getState().campaignSchedules[CAMPAIGN_ID]
    expect(state).toBeDefined()
    expect(state.nextSessionDate).toBe('2025-06-15T00:00:00.000Z')
    expect(state.scheduleLabel).toBe('Every Saturday at 7:00 PM (UTC)')
    expect(state.nextSessionIsManual).toBe(false)
  })

  it('marks nextSessionIsManual when a manual override is set', () => {
    useStore.getState().handleCampaignScheduleUpdated(
      makeEvent({
        campaignId: CAMPAIGN_ID,
        nextSessionDate: '2025-07-04T18:00:00.000Z',
        scheduleLabel: 'Every Saturday at 7:00 PM (UTC)',
        nextSessionIsManual: true,
      }),
    )

    expect(useStore.getState().campaignSchedules[CAMPAIGN_ID]?.nextSessionIsManual).toBe(true)
  })

  it('clears the schedule when nextSessionDate and scheduleLabel are null', () => {
    // Prime some existing state
    useStore.setState({
      campaignSchedules: {
        [CAMPAIGN_ID]: {
          nextSessionDate: '2025-06-15T00:00:00.000Z',
          scheduleLabel: 'Every Saturday at 7:00 PM (UTC)',
          nextSessionIsManual: false,
        },
      },
    })

    useStore.getState().handleCampaignScheduleUpdated(
      makeEvent({
        campaignId: CAMPAIGN_ID,
        nextSessionDate: null,
        scheduleLabel: null,
        nextSessionIsManual: false,
      }),
    )

    const state = useStore.getState().campaignSchedules[CAMPAIGN_ID]
    expect(state.nextSessionDate).toBeNull()
    expect(state.scheduleLabel).toBeNull()
  })

  it('no-ops if payload has no campaignId', () => {
    useStore.getState().handleCampaignScheduleUpdated(makeEvent({}))
    expect(useStore.getState().campaignSchedules).toEqual({})
  })

  it('setCampaignSchedule directly sets state', () => {
    useStore.getState().setCampaignSchedule(CAMPAIGN_ID, {
      nextSessionDate: '2025-08-01T00:00:00.000Z',
      scheduleLabel: 'Every Friday at 8:00 PM (UTC)',
      nextSessionIsManual: false,
    })

    expect(useStore.getState().campaignSchedules[CAMPAIGN_ID]?.scheduleLabel).toBe(
      'Every Friday at 8:00 PM (UTC)',
    )
  })

  it('clearCampaignSchedule removes the entry', () => {
    useStore.getState().setCampaignSchedule(CAMPAIGN_ID, {
      nextSessionDate: '2025-08-01T00:00:00.000Z',
      scheduleLabel: 'Every Friday at 8:00 PM (UTC)',
      nextSessionIsManual: false,
    })

    useStore.getState().clearCampaignSchedule(CAMPAIGN_ID)
    expect(useStore.getState().campaignSchedules[CAMPAIGN_ID]).toBeUndefined()
  })
})
