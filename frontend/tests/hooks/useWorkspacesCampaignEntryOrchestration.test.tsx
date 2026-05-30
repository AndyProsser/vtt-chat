import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionState, type UUID } from '@shared'
import { useWorkspacesCampaignEntryOrchestration } from '@/hooks/session/useWorkspacesCampaignEntryOrchestration'

const USER_ID = '11111111-1111-4111-8111-111111111111' as UUID
const CAMPAIGN_ID = '22222222-2222-4222-8222-222222222222' as UUID
const SESSION_ID = '33333333-3333-4333-8333-333333333333' as UUID

describe('useWorkspacesCampaignEntryOrchestration', () => {
  it('uses the direct watch endpoint and enters the returned session', async () => {
    const fetchWithAuthGuard = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ campaignId: CAMPAIGN_ID, sessionId: SESSION_ID }),
    })
    const refreshLobbyCampaignData = vi.fn().mockResolvedValue([
      {
        id: CAMPAIGN_ID,
        name: 'Open Table',
        discoverable: true,
        spectatorsEnabled: true,
        latestSessionState: SessionState.ACTIVE,
        activeConnectedCount: 2,
        dmOnline: true,
        connectedPlayers: 1,
      },
    ])
    const fetchCampaignSessionsData = vi.fn().mockResolvedValue([
      {
        id: SESSION_ID,
        name: 'Chapter 1',
        dmId: USER_ID,
        state: SessionState.ACTIVE,
        createdAt: Date.now(),
        startedAt: Date.now() - 1_000,
      },
    ])
    const ensureSessionMembership = vi.fn().mockResolvedValue(undefined)
    const replaceSessions = vi.fn()
    const setCurrentSession = vi.fn()
    const setSelectedCampaignId = vi.fn()
    const setError = vi.fn()
    const setLobbyNotice = vi.fn()

    const { result } = renderHook(() =>
      useWorkspacesCampaignEntryOrchestration({
        apiUrl: 'https://api.test',
        token: 'token',
        userId: USER_ID,
        userAuthType: 'FULL',
        campaigns: [
          {
            id: CAMPAIGN_ID,
            name: 'Open Table',
            discoverable: true,
            spectatorsEnabled: true,
            latestSessionState: SessionState.ACTIVE,
            activeConnectedCount: 2,
            dmOnline: true,
            connectedPlayers: 1,
          },
        ],
        selectedCampaignId: '' as UUID | '',
        sessionNameBase: 'Session',
        newCampaignName: '',
        joinInviteInput: '',
        setCampaigns: vi.fn(),
        setSelectedCampaignId,
        setShowCreateCampaignModal: vi.fn(),
        setShowJoinCampaignModal: vi.fn(),
        setNewCampaignName: vi.fn(),
        setJoinInviteInput: vi.fn(),
        setEditorWorkspaceView: vi.fn(),
        setIsCreatingCampaign: vi.fn(),
        setIsJoiningCampaign: vi.fn(),
        refreshLobbyCampaignData,
        setError,
        setLobbyNotice,
        fetchWithAuthGuard,
        fetchCampaignSessionsData,
        ensureSessionMembership,
        replaceSessions,
        setCurrentSession,
        openEditorCampaignWorkspace: vi.fn(),
      })
    )

    await act(async () => {
      await result.current.handleWatchCampaign({
        id: CAMPAIGN_ID,
        name: 'Open Table',
        discoverable: true,
        spectatorsEnabled: true,
        latestSessionState: SessionState.ACTIVE,
        activeConnectedCount: 2,
        dmOnline: true,
        connectedPlayers: 1,
      })
    })

    await waitFor(() => {
      expect(fetchWithAuthGuard).toHaveBeenCalledWith(
        'https://api.test/api/campaigns/22222222-2222-4222-8222-222222222222/watch',
        expect.objectContaining({ method: 'POST' })
      )
    })

    expect(refreshLobbyCampaignData).toHaveBeenCalledWith({
      showLoading: false,
      surfaceError: false,
    })
    expect(fetchCampaignSessionsData).toHaveBeenCalledWith(CAMPAIGN_ID)
    expect(ensureSessionMembership).toHaveBeenCalledWith(SESSION_ID)
    expect(replaceSessions).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: SESSION_ID })])
    )
    expect(setSelectedCampaignId).toHaveBeenCalledWith(CAMPAIGN_ID)
    expect(setCurrentSession).toHaveBeenCalledWith(SESSION_ID)
    expect(setError).toHaveBeenCalledWith(null)
    expect(setLobbyNotice).toHaveBeenCalledWith(null)
  })
})
