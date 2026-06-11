import { describe, expect, it } from 'vitest'
import { getCampaignEntryAction, type CampaignSummary } from '@/types/session/campaign'

function buildCampaign(overrides: Partial<CampaignSummary> = {}): CampaignSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Iron Keep',
    discoverable: true,
    spectatorsEnabled: true,
    latestSessionState: 'ACTIVE',
    activeConnectedCount: 2,
    memberRole: undefined,
    ...overrides,
  }
}

describe('getCampaignEntryAction', () => {
  it('prefers WATCH for discoverable campaigns that are actively watchable', () => {
    const action = getCampaignEntryAction(buildCampaign())

    expect(action).toMatchObject({
      label: 'Watch',
      action: 'watch',
      disabled: false,
      showLock: false,
    })
  })

  it('falls back to Request to Join when a public campaign is not watchable', () => {
    const action = getCampaignEntryAction(
      buildCampaign({
        latestSessionState: 'IDLE',
        activeConnectedCount: 0,
        spectatorInviteCode: null,
      })
    )

    expect(action).toMatchObject({
      label: 'Request to Join',
      action: 'joinRequest',
      disabled: false,
    })
  })

  it('keeps invite-only campaigns locked when no watch or join path exists', () => {
    const action = getCampaignEntryAction(
      buildCampaign({
        discoverable: false,
        spectatorsEnabled: true,
        latestSessionState: 'IDLE',
        activeConnectedCount: 0,
      })
    )

    expect(action).toMatchObject({
      label: 'Invite Only',
      disabled: true,
      dimmed: true,
      showLock: true,
    })
  })

  it('shows WATCH for private campaigns when spectators are enabled and the table is live', () => {
    const action = getCampaignEntryAction(
      buildCampaign({
        discoverable: false,
        spectatorsEnabled: true,
        latestSessionState: 'ACTIVE',
        activeConnectedCount: 2,
      })
    )

    expect(action).toMatchObject({
      label: 'Watch',
      action: 'watch',
      disabled: false,
      showLock: true,
    })
  })
})
