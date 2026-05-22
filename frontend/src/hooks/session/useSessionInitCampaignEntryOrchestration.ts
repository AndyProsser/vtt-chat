import { useCallback } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { UUID } from '@shared'
import { SessionState } from '@shared'
import type { Session as SessionRecord } from '@/types/session'
import type { CampaignSummary } from '@/types/session/campaign'
import {
  buildDefaultChapterName,
  getPreferredSession,
  normalizeSessionRecord,
  parsePlayerInviteCode,
} from '@/utils/session/sessionInit'
import { getCampaignDisplayState, getCampaignEntryAction } from '@/types/session/campaign'

type UseSessionInitCampaignEntryOrchestrationParams = {
  apiUrl: string
  token: string
  userId: UUID
  userAuthType?: 'FULL' | 'GUEST'
  campaigns: CampaignSummary[]
  selectedCampaignId: UUID | ''
  newCampaignName: string
  joinInviteInput: string
  setCampaigns: Dispatch<SetStateAction<CampaignSummary[]>>
  setSelectedCampaignId: Dispatch<SetStateAction<UUID | ''>>
  setShowCreateCampaignModal: Dispatch<SetStateAction<boolean>>
  setShowJoinCampaignModal: Dispatch<SetStateAction<boolean>>
  setNewCampaignName: Dispatch<SetStateAction<string>>
  setJoinInviteInput: Dispatch<SetStateAction<string>>
  setEditorWorkspaceView: Dispatch<SetStateAction<'lobby' | 'editor'>>
  setIsCreatingCampaign: Dispatch<SetStateAction<boolean>>
  setIsJoiningCampaign: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  setLobbyNotice: Dispatch<SetStateAction<string | null>>
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  fetchCampaignSessionsData: (campaignId: UUID) => Promise<SessionRecord[]>
  ensureSessionMembership: (sessionId: UUID) => Promise<void>
  replaceSessions: (sessions: SessionRecord[]) => void
  setCurrentSession: (sessionId: UUID | null) => void
  openEditorCampaignWorkspace: (campaignId: UUID) => void
  onSessionCreated?: (sessionId: UUID) => void
}

export function useSessionInitCampaignEntryOrchestration(
  params: UseSessionInitCampaignEntryOrchestrationParams
) {
  const {
    apiUrl,
    token,
    userId,
    userAuthType,
    campaigns,
    selectedCampaignId,
    newCampaignName,
    joinInviteInput,
    setCampaigns,
    setSelectedCampaignId,
    setShowCreateCampaignModal,
    setShowJoinCampaignModal,
    setNewCampaignName,
    setJoinInviteInput,
    setEditorWorkspaceView,
    setIsCreatingCampaign,
    setIsJoiningCampaign,
    setError,
    setLobbyNotice,
    fetchWithAuthGuard,
    fetchCampaignSessionsData,
    ensureSessionMembership,
    replaceSessions,
    setCurrentSession,
    openEditorCampaignWorkspace,
    onSessionCreated,
  } = params

  const handleEnterCampaign = useCallback(
    async (campaignId?: UUID, preferredSessionId?: UUID) => {
      setError(null)
      setLobbyNotice(null)

      const targetCampaignId = campaignId || selectedCampaignId
      if (!targetCampaignId) {
        setError('Select a campaign before entering')
        return
      }

      if (targetCampaignId !== selectedCampaignId) {
        setSelectedCampaignId(targetCampaignId)
      }

      const targetCampaign = campaigns.find((campaign) => campaign.id === targetCampaignId)
      if (targetCampaign) {
        const launchAction = getCampaignEntryAction(targetCampaign)
        if (launchAction.disabled) {
          setError(launchAction.reason || 'Launch is currently unavailable for this campaign.')
          return
        }
      }

      if (targetCampaign?.memberRole === 'SPECTATOR') {
        const state = getCampaignDisplayState(targetCampaign)
        if (state !== 'ACTIVE') {
          setError('Spectators can only watch active campaigns.')
          return
        }

        const hasTableOnline =
          Boolean(targetCampaign.dmOnline) || (targetCampaign.connectedPlayers || 0) > 0
        if (!hasTableOnline) {
          setError('Campaign is active but no DM/player is online yet. Please wait.')
          return
        }
      }

      let targetSessions: SessionRecord[] = []
      try {
        targetSessions = await fetchCampaignSessionsData(targetCampaignId)
        replaceSessions(targetSessions)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load campaign sessions'
        setError(message)
        return
      }

      const preferredSession =
        (preferredSessionId
          ? targetSessions.find((session) => session.id === preferredSessionId) || null
          : null) || getPreferredSession(targetSessions)

      if (preferredSession) {
        await ensureSessionMembership(preferredSession.id)
        setCurrentSession(preferredSession.id)
        return
      }

      const canStartAsDm = targetCampaign?.currentDmId === userId
      if (!canStartAsDm) {
        setError('No campaign chapter is available yet. Wait for the DM to start the session.')
        return
      }

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${targetCampaignId}/sessions/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name: buildDefaultChapterName(targetSessions) }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to start campaign chapter')
        }

        const payload = (await response.json()) as { session: SessionRecord }
        await ensureSessionMembership(payload.session.id)
        replaceSessions([normalizeSessionRecord(payload.session), ...targetSessions])
        setCurrentSession(payload.session.id)
        onSessionCreated?.(payload.session.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      }
    },
    [
      apiUrl,
      campaigns,
      ensureSessionMembership,
      fetchCampaignSessionsData,
      fetchWithAuthGuard,
      onSessionCreated,
      replaceSessions,
      selectedCampaignId,
      setCurrentSession,
      setError,
      setLobbyNotice,
      setSelectedCampaignId,
      token,
      userId,
    ]
  )

  const handleCreateCampaign = useCallback(
    async (intent: 'edit' | 'launch') => {
      setError(null)
      setLobbyNotice(null)

      if (userAuthType === 'GUEST') {
        setError('Upgrade to a full account before creating a new campaign.')
        return
      }

      setIsCreatingCampaign(true)
      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: newCampaignName }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to create campaign')
        }

        const data = (await response.json()) as { campaign: CampaignSummary }
        const campaign = data.campaign
        setCampaigns((prev) => [campaign, ...prev])
        setSelectedCampaignId(campaign.id)
        setShowCreateCampaignModal(false)

        if (intent === 'launch') {
          setLobbyNotice('Campaign created. Launching now.')
          setEditorWorkspaceView('lobby')
          await handleEnterCampaign(campaign.id)
        } else {
          setLobbyNotice('Campaign created. Offline edit/review mode is ready.')
          openEditorCampaignWorkspace(campaign.id)
        }

        setNewCampaignName('')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      } finally {
        setIsCreatingCampaign(false)
      }
    },
    [
      apiUrl,
      fetchWithAuthGuard,
      handleEnterCampaign,
      newCampaignName,
      openEditorCampaignWorkspace,
      setCampaigns,
      setError,
      setIsCreatingCampaign,
      setLobbyNotice,
      setEditorWorkspaceView,
      setNewCampaignName,
      setSelectedCampaignId,
      setShowCreateCampaignModal,
      token,
      userAuthType,
    ]
  )

  const handleJoinCampaign = useCallback(
    (event: FormEvent) => {
      event.preventDefault()
      setError(null)
      setLobbyNotice(null)
      setIsJoiningCampaign(true)

      void (async () => {
        try {
          const inviteCode = parsePlayerInviteCode(joinInviteInput)
          if (!inviteCode) {
            throw new Error('Invite code or join link is required')
          }

          const validateResponse = await fetchWithAuthGuard(
            `${apiUrl}/api/campaigns/invite/${encodeURIComponent(inviteCode)}/validate`
          )

          if (!validateResponse.ok) {
            const validateErrorData = await validateResponse.json().catch(() => ({}))
            throw new Error(validateErrorData.message || 'Invalid or expired invite code')
          }

          const validateData = (await validateResponse.json()) as {
            valid?: boolean
            campaign?: { id?: UUID }
          }
          const campaignId = validateData.campaign?.id
          if (!validateData.valid || !campaignId) {
            throw new Error('Invalid or expired invite code')
          }

          const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/${campaignId}/join`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ inviteCode }),
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.message || 'Failed to join campaign')
          }

          const campaignsResponse = await fetchWithAuthGuard(`${apiUrl}/api/campaigns`, {
            headers: { Authorization: `Bearer ${token}` },
          })

          if (!campaignsResponse.ok) {
            const errorData = await campaignsResponse.json().catch(() => ({}))
            throw new Error(errorData.message || 'Joined campaign but failed to reload campaigns')
          }

          const campaignsData = (await campaignsResponse.json()) as {
            campaigns?: CampaignSummary[]
          }
          const nextCampaigns = campaignsData.campaigns || []
          setCampaigns(nextCampaigns)
          setSelectedCampaignId(campaignId as UUID)
          setLobbyNotice('Campaign ready in your lobby. Continue when you are ready.')
          setShowJoinCampaignModal(false)
          setJoinInviteInput('')
        } catch (err) {
          const message = err instanceof Error ? err.message : 'An error occurred'
          setError(message)
        } finally {
          setIsJoiningCampaign(false)
        }
      })()
    },
    [
      apiUrl,
      fetchWithAuthGuard,
      joinInviteInput,
      setCampaigns,
      setError,
      setIsJoiningCampaign,
      setJoinInviteInput,
      setLobbyNotice,
      setSelectedCampaignId,
      setShowJoinCampaignModal,
      token,
    ]
  )

  const startCampaignSession = useCallback(
    async (campaignId: UUID, existingSessions: SessionRecord[]): Promise<UUID | null> => {
      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${campaignId}/sessions/start`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name: buildDefaultChapterName(existingSessions) }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to start campaign chapter')
        }

        const payload = (await response.json()) as { session: SessionRecord }
        await ensureSessionMembership(payload.session.id)
        replaceSessions([normalizeSessionRecord(payload.session), ...existingSessions])
        setCurrentSession(payload.session.id)
        onSessionCreated?.(payload.session.id)
        return payload.session.id
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
        return null
      }
    },
    [
      apiUrl,
      ensureSessionMembership,
      fetchWithAuthGuard,
      onSessionCreated,
      replaceSessions,
      setCurrentSession,
      setError,
      token,
    ]
  )

  return {
    handleCreateCampaign,
    handleJoinCampaign,
    handleEnterCampaign,
    startCampaignSession,
  }
}
