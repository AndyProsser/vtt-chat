import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionState } from '@shared'
import {
  CampaignSessionSettingsPanel,
  type CampaignSessionSettingsPanelProps,
} from '@/components/workspaces/shared/panels/CampaignSessionSettingsPanel'

function buildProps(
  overrides: Partial<CampaignSessionSettingsPanelProps> = {}
): CampaignSessionSettingsPanelProps {
  return {
    campaignId: 'campaign-1',
    sessionName: 'The Emerald Crown #10',
    plannedDurationMinutes: 180,
    defaultSessionDurationMinutes: 180,
    sessionStateLabel: SessionState.ACTIVE,
    sessionStartedAt: Date.now() - 5 * 60_000,
    canEditSessionSettings: true,
    onSessionNameChange: vi.fn(),
    onPlannedDurationMinutesChange: vi.fn(),
    onSaveSessionSettings: vi.fn(),
    isSessionSaving: false,
    isSaving: false,
    isLoading: false,
    ...overrides,
  }
}

describe('CampaignSessionSettingsPanel', () => {
  it('shows the session timer while the session is active', () => {
    render(<CampaignSessionSettingsPanel {...buildProps()} />)

    expect(screen.getByText('Session Timer')).toBeTruthy()
  })

  it('hides the session timer after the session has ended', () => {
    render(
      <CampaignSessionSettingsPanel
        {...buildProps({
          sessionStateLabel: SessionState.ENDED,
        })}
      />
    )

    expect(screen.queryByText('Session Timer')).toBeNull()
  })
})
