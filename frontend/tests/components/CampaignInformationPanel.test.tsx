import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
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

  describe('read-only mode (non-DM)', () => {
    it('renders campaign info without edit controls when canEdit is false', () => {
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={3}
          totalSessionDurationMs={7200000}
          canEdit={false}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={vi.fn()}
        />
      )

      expect(screen.getByText('Test Campaign')).toBeTruthy()
      expect(screen.getByText('A test campaign description')).toBeTruthy()
      expect(screen.getByText('3')).toBeTruthy()
      expect(screen.getByText('2h')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /edit campaign info/i })).toBeNull()
    })

    it('does not show edit mode UI when canEdit is false', () => {
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={1}
          totalSessionDurationMs={3600000}
          canEdit={false}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={vi.fn()}
        />
      )

      expect(screen.queryByLabelText(/campaign name/i)).toBeNull()
      expect(screen.queryByLabelText(/description/i)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
      expect(screen.getByText('Campaign metadata is read-only for your role.')).toBeTruthy()
    })
  })

  describe('edit mode (DM)', () => {
    it('displays edit and open settings buttons when canEdit is true', () => {
      const onEditCampaign = vi.fn()
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={1}
          totalSessionDurationMs={3600000}
          canEdit={true}
          onEditCampaign={onEditCampaign}
          onSaveCampaignInfo={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: 'Edit campaign info' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Open full settings' })).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: 'Open full settings' }))
      expect(onEditCampaign).toHaveBeenCalled()
    })

    it('switches to edit mode when edit button is clicked', async () => {
      const onSaveCampaignInfo = vi.fn(async () => {})
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={1}
          totalSessionDurationMs={3600000}
          canEdit={true}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={onSaveCampaignInfo}
        />
      )

      // Click "Edit campaign info" button to enter edit mode
      fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

      // Look for textarea/input that indicates edit mode is active
      await waitFor(() => {
        const descInput = screen.queryByDisplayValue('A test campaign description')
        expect(descInput).toBeTruthy()
      })
    })

    it('allows editing campaign name, description, and integration policy', async () => {
      const onSaveCampaignInfo = vi.fn(async () => {})
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={1}
          totalSessionDurationMs={3600000}
          canEdit={true}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={onSaveCampaignInfo}
        />
      )

      // Click "Edit campaign info" to enter edit mode
      fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

      await waitFor(() => {
        expect(screen.queryByDisplayValue('Test Campaign')).toBeTruthy()
      })

      const nameInput = screen.getByDisplayValue('Test Campaign') as HTMLInputElement
      const descInput = screen.getByDisplayValue(
        'A test campaign description'
      ) as HTMLTextAreaElement

      fireEvent.change(nameInput, { target: { value: 'Updated Campaign' } })
      fireEvent.change(descInput, { target: { value: 'Updated description' } })

      // Change integration policy (ALLOW button)
      const allowButton = screen.getByRole('button', { name: 'ALLOW' })
      fireEvent.click(allowButton)

      const saveButton = screen.getByRole('button', { name: 'Save' })
      fireEvent.click(saveButton)

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

    it('cancels edit mode without saving changes', async () => {
      const onSaveCampaignInfo = vi.fn()
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={1}
          totalSessionDurationMs={3600000}
          canEdit={true}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={onSaveCampaignInfo}
        />
      )

      // Click "Edit campaign info" to enter edit mode
      fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

      await waitFor(() => {
        expect(screen.queryByDisplayValue('Test Campaign')).toBeTruthy()
      })

      const nameInput = screen.getByDisplayValue('Test Campaign') as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'Changed Campaign' } })

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      expect(onSaveCampaignInfo).not.toHaveBeenCalled()
      expect(screen.queryByDisplayValue('Changed Campaign')).toBeNull()
    })
  })

  describe('integration policy controls', () => {
    it('renders integration policy buttons in edit mode', async () => {
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={1}
          totalSessionDurationMs={3600000}
          canEdit={true}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={vi.fn()}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'ALLOW' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'DM_ONLY' })).toBeTruthy()
        expect(screen.getByRole('button', { name: 'BLOCK' })).toBeTruthy()
      })
    })

    it('allows changing extension policy to DM_ONLY', async () => {
      const onSaveCampaignInfo = vi.fn(async () => {})
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={1}
          totalSessionDurationMs={3600000}
          canEdit={true}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={onSaveCampaignInfo}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'DM_ONLY' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: 'DM_ONLY' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(onSaveCampaignInfo).toHaveBeenCalledWith(
          'campaign-1',
          expect.objectContaining({
            integrationSyncPolicy: 'DM_ONLY',
          })
        )
      })
    })

    it('allows changing extension policy to NONE/BLOCK', async () => {
      const onSaveCampaignInfo = vi.fn(async () => {})
      render(
        <CampaignInformationPanel
          campaign={mockCampaign}
          sessionCount={1}
          totalSessionDurationMs={3600000}
          canEdit={true}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={onSaveCampaignInfo}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Edit campaign info' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'BLOCK' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: 'BLOCK' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => {
        expect(onSaveCampaignInfo).toHaveBeenCalledWith(
          'campaign-1',
          expect.objectContaining({
            integrationSyncPolicy: 'NONE',
          })
        )
      })
    })
  })

  describe('null campaign handling', () => {
    it('renders gracefully when campaign is null', () => {
      render(
        <CampaignInformationPanel
          campaign={null}
          sessionCount={0}
          totalSessionDurationMs={0}
          canEdit={false}
          onEditCampaign={vi.fn()}
          onSaveCampaignInfo={vi.fn()}
        />
      )

      expect(
        screen.getByText('Select a campaign to view its metadata and activity summary.')
      ).toBeTruthy()
    })
  })
})
