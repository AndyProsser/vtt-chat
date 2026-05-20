import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignSummary } from '@shared'
import { CampaignInformationPanel } from '../../src/components/session/CampaignInformationPanel'

describe('CampaignInformationPanel', () => {
  const mockCampaign: CampaignSummary = {
    id: 'campaign-1',
    name: 'Test Campaign',
    description: 'A test campaign description',
    currentDmId: 'dm-1',
    posterUrl: null,
    extensionSyncPolicy: 'DM_AND_PLAYERS',
    inviteCode: 'TEST123',
    inviteActive: true,
    postSessionChatEnabled: true,
    postSessionChatDurationMs: 300000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isArchived: false,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders panel title and single-line status summary in read-only mode', () => {
    render(
      <CampaignInformationPanel
        campaign={mockCampaign}
        sessionCount={3}
        totalSessionDurationMs={7200000}
        canEdit={false}
        onSaveCampaignInfo={vi.fn()}
      />
    )

    expect(screen.getByText('Campaign Info')).toBeTruthy()
    expect(screen.getByText(/Sessions/i)).toBeTruthy()
    expect(screen.getByText(/Total played/i)).toBeTruthy()
    expect(screen.getByText(/Players/i)).toBeTruthy()
    expect(screen.getByText(/Spectators/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /edit campaign info/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /open full settings/i })).toBeNull()
  })

  it('enters edit mode and shows icon formatting toolbar', async () => {
    render(
      <CampaignInformationPanel
        campaign={mockCampaign}
        sessionCount={1}
        totalSessionDurationMs={3600000}
        canEdit={true}
        onSaveCampaignInfo={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Bold')).toBeTruthy()
      expect(screen.getByLabelText('Italic')).toBeTruthy()
      expect(screen.getByLabelText('Bullet list')).toBeTruthy()
      expect(screen.getByLabelText('Numbered list')).toBeTruthy()
    })
  })

  it('saves edits from top-right action buttons', async () => {
    const onSaveCampaignInfo = vi.fn(async () => {})
    render(
      <CampaignInformationPanel
        campaign={mockCampaign}
        sessionCount={1}
        totalSessionDurationMs={3600000}
        canEdit={true}
        onSaveCampaignInfo={onSaveCampaignInfo}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

    const nameInput = await screen.findByDisplayValue('Test Campaign')
    const descInput = screen.getByDisplayValue('A test campaign description')

    fireEvent.change(nameInput, { target: { value: 'Updated Campaign' } })
    fireEvent.change(descInput, { target: { value: 'Updated description' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save campaign info' }))

    await waitFor(() => {
      expect(onSaveCampaignInfo).toHaveBeenCalledWith(
        'campaign-1',
        expect.objectContaining({
          name: 'Updated Campaign',
          description: 'Updated description',
          integrationSyncPolicy: 'ALLOW',
        })
      )
    })
  })

  it('supports undoing edits from top-right undo action', async () => {
    const onSaveCampaignInfo = vi.fn()
    render(
      <CampaignInformationPanel
        campaign={mockCampaign}
        sessionCount={1}
        totalSessionDurationMs={3600000}
        canEdit={true}
        onSaveCampaignInfo={onSaveCampaignInfo}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

    const nameInput = await screen.findByDisplayValue('Test Campaign')
    fireEvent.change(nameInput, { target: { value: 'Changed Campaign' } })

    fireEvent.click(screen.getByRole('button', { name: 'Undo campaign edits' }))

    expect(onSaveCampaignInfo).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('Changed Campaign')).toBeNull()
  })

  it('does not render poster URL field in edit mode', async () => {
    render(
      <CampaignInformationPanel
        campaign={mockCampaign}
        sessionCount={1}
        totalSessionDurationMs={3600000}
        canEdit={true}
        onSaveCampaignInfo={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

    await waitFor(() => {
      expect(screen.queryByText(/Poster URL/i)).toBeNull()
      expect(screen.getByText('Browse...')).toBeTruthy()
    })
  })

  it('renders a subtle DM details trigger and hides inline status rows', () => {
    render(
      <CampaignInformationPanel
        campaign={{
          ...mockCampaign,
          dmDisplayName: 'Morgan',
          dmOnline: false,
          updatedAt: 1_700_000_000_000,
        }}
        sessionCount={1}
        totalSessionDurationMs={3600000}
        canEdit={false}
        onSaveCampaignInfo={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'DM details' })).toBeTruthy()
    expect(screen.queryByText('Last session')).toBeNull()
  })

  it('renders gracefully when campaign is null', () => {
    render(
      <CampaignInformationPanel
        campaign={null}
        sessionCount={0}
        totalSessionDurationMs={0}
        canEdit={false}
        onSaveCampaignInfo={vi.fn()}
      />
    )

    expect(screen.getByText('Campaign Info')).toBeTruthy()
    expect(
      screen.getByText('Select a campaign to view its metadata and activity summary.')
    ).toBeTruthy()
  })
})
