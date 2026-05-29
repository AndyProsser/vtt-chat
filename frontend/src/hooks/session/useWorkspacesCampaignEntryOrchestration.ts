import { useCallback } from 'react'
import type { Dispatch, SetStateAction, SubmitEventHandler } from 'react'
import { normalizeCampaignSessionBaseName, type UUID } from '@shared'
import { SessionState } from '@shared'
import type { Session as SessionRecord } from '@/types/session'
import type { CampaignJoinRequestSummary, CampaignSummary } from '@/types/session/campaign'
import {
  buildDefaultChapterName,
  getPreferredSession,
  normalizeSessionRecord,
  parsePlayerInviteCode,
} from '@/utils/session/workspaces'
import { getCampaignDisplayState, getCampaignEntryAction } from '@/types/session/campaign'
import type { EditorWorkspaceView } from '@/types/workspaces'

type UseWorkspacesCampaignEntryOrchestrationParams = {
  apiUrl: string
  token: string
  userId: UUID
  userAuthType?: 'FULL' | 'GUEST'
  campaigns: CampaignSummary[]
  selectedCampaignId: UUID | ''
  sessionNameBase: string
  newCampaignName: string
  joinInviteInput: string
  setCampaigns: Dispatch<SetStateAction<CampaignSummary[]>>
  setSelectedCampaignId: Dispatch<SetStateAction<UUID | ''>>
  setShowCreateCampaignModal: Dispatch<SetStateAction<boolean>>
  setShowJoinCampaignModal: Dispatch<SetStateAction<boolean>>
  setNewCampaignName: Dispatch<SetStateAction<string>>
  setJoinInviteInput: Dispatch<SetStateAction<string>>
  setEditorWorkspaceView: Dispatch<SetStateAction<EditorWorkspaceView>>
  setIsCreatingCampaign: Dispatch<SetStateAction<boolean>>
  setIsJoiningCampaign: Dispatch<SetStateAction<boolean>>
  refreshLobbyCampaignData: (options?: {
    showLoading?: boolean
    surfaceError?: boolean
  }) => Promise<CampaignSummary[] | null>
  setError: Dispatch<SetStateAction<string | null>>
  setLobbyNotice: Dispatch<SetStateAction<string | null>>
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  fetchCampaignSessionsData: (campaignId: UUID) => Promise<SessionRecord[]>
  ensureSessionMembership: (sessionId: UUID) => Promise<void>
  replaceSessions: (sessions: SessionRecord[]) => void
  setCurrentSession: (sessionId: UUID | null) => void
  openEditorCampaignWorkspace: (campaignId: UUID) => void
  onSessionCreated?: (sessionId: UUID) => void
  onCampaignDeleted?: (campaignId: UUID) => void
}

export function useWorkspacesCampaignEntryOrchestration(
  params: UseWorkspacesCampaignEntryOrchestrationParams
) {
  const {
    apiUrl,
    token,
    userId,
    userAuthType,
    campaigns,
    selectedCampaignId,
    sessionNameBase,
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
    refreshLobbyCampaignData,
    setError,
    setLobbyNotice,
    fetchWithAuthGuard,
    fetchCampaignSessionsData,
    ensureSessionMembership,
    replaceSessions,
    setCurrentSession,
    openEditorCampaignWorkspace,
    onSessionCreated,
    onCampaignDeleted,
  } = params

  const getSessionStartName = useCallback(
    (existingSessions: SessionRecord[], campaignName?: string): string => {
      const trimmed = sessionNameBase.trim()
      const normalizedBase = normalizeCampaignSessionBaseName(trimmed || campaignName || 'Session')
      const resolvedBaseName =
        trimmed && normalizedBase === 'Session' && campaignName ? campaignName : normalizedBase

      return buildDefaultChapterName(existingSessions, resolvedBaseName)
    },
    [sessionNameBase]
  )

  const shouldEnsureMembership = useCallback(
    (session: SessionRecord) => session.state !== SessionState.CLEANUP,
    []
  )

  const handleEnterCampaign = useCallback(
    async (campaignId?: UUID, preferredSessionId?: UUID, campaignHint?: CampaignSummary) => {
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

      const targetCampaign =
        campaignHint && campaignHint.id === targetCampaignId
          ? campaignHint
          : campaigns.find((campaign) => campaign.id === targetCampaignId)
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
        if (shouldEnsureMembership(preferredSession)) {
          await ensureSessionMembership(preferredSession.id)
        }
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
            body: JSON.stringify({
              name: getSessionStartName(targetSessions, targetCampaign?.name),
            }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to start campaign chapter')
        }

        const payload = (await response.json()) as { session: SessionRecord }
        if (shouldEnsureMembership(payload.session)) {
          await ensureSessionMembership(payload.session.id)
        }
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
      getSessionStartName,
      onSessionCreated,
      replaceSessions,
      selectedCampaignId,
      setCurrentSession,
      setError,
      setLobbyNotice,
      setSelectedCampaignId,
      shouldEnsureMembership,
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
        const campaign: CampaignSummary = {
          ...data.campaign,
          currentDmId: data.campaign.currentDmId ?? userId,
          memberRole: data.campaign.memberRole ?? 'DM',
          isMember: data.campaign.isMember ?? true,
        }
        setCampaigns((prev) => [campaign, ...prev])
        setSelectedCampaignId(campaign.id)
        setShowCreateCampaignModal(false)

        if (intent === 'launch') {
          setLobbyNotice('Campaign created. Launching now.')
          setEditorWorkspaceView('lobby')
          await handleEnterCampaign(campaign.id, undefined, campaign)
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
      userId,
    ]
  )

  const handleJoinCampaign = useCallback<SubmitEventHandler<HTMLFormElement>>(
    (event) => {
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
            body: JSON.stringify({ name: getSessionStartName(existingSessions) }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to start campaign chapter')
        }

        const payload = (await response.json()) as { session: SessionRecord }
        if (shouldEnsureMembership(payload.session)) {
          await ensureSessionMembership(payload.session.id)
        }
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
      getSessionStartName,
      onSessionCreated,
      replaceSessions,
      setCurrentSession,
      setError,
      shouldEnsureMembership,
      token,
    ]
  )

  const handleJoinRequest = useCallback(
    async (campaign: CampaignSummary) => {
      setError(null)
      setLobbyNotice(null)

      if (!campaign.discoverable) {
        setError('Join requests are only available for public campaigns.')
        return
      }

      const optionalMessage = window
        .prompt(`Optional message for the DM of ${campaign.name}:`, '')
        ?.trim()

      try {
        const response = await fetchWithAuthGuard(
          `${apiUrl}/api/campaigns/${campaign.id}/join-request`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              message: optionalMessage || undefined,
            }),
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to submit join request')
        }

        await refreshLobbyCampaignData({ showLoading: false, surfaceError: false })
        setLobbyNotice('Join request sent. The DM can review it from their campaign card.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      }
    },
    [apiUrl, fetchWithAuthGuard, refreshLobbyCampaignData, setError, setLobbyNotice, token]
  )

  const handleWatchCampaign = useCallback(
    (campaign: CampaignSummary) => {
      setError(null)
      setLobbyNotice(null)

      const inviteCode = campaign.spectatorInviteCode?.trim()
      if (!inviteCode || campaign.spectatorInviteActive === false) {
        setError('Watch is unavailable for this campaign right now.')
        return
      }

      window.location.assign(`/watch/${encodeURIComponent(inviteCode)}`)
    },
    [setError, setLobbyNotice]
  )

  const handleLoadPendingJoinRequests = useCallback(
    async (campaignId: UUID): Promise<CampaignJoinRequestSummary[]> => {
      setError(null)

      const response = await fetchWithAuthGuard(
        `${apiUrl}/api/campaigns/${campaignId}/join-request`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to load pending join requests')
      }

      const payload = (await response.json()) as {
        requests?: CampaignJoinRequestSummary[]
      }

      return payload.requests || []
    },
    [apiUrl, fetchWithAuthGuard, setError, token]
  )

  const handleResolveJoinRequest = useCallback(
    async (campaignId: UUID, requestId: UUID, resolution: 'APPROVED' | 'REJECTED') => {
      setError(null)
      setLobbyNotice(null)

      const actionPath = resolution === 'APPROVED' ? 'approve' : 'reject'
      const response = await fetchWithAuthGuard(
        `${apiUrl}/api/campaigns/${campaignId}/join-request/${requestId}/${actionPath}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to resolve join request')
      }

      await refreshLobbyCampaignData({ showLoading: false, surfaceError: false })
      setLobbyNotice(
        resolution === 'APPROVED'
          ? 'Join request approved. The player can now launch the campaign.'
          : 'Join request rejected.'
      )
    },
    [apiUrl, fetchWithAuthGuard, refreshLobbyCampaignData, setError, setLobbyNotice, token]
  )

  /**
   * DM deletes the currently selected campaign.
   * DEV: backend performs a hard delete (row removed).
   * PROD: backend performs a soft delete (deletedAt timestamp); admin can restore.
   * Callers must confirm intent before invoking — this function does not prompt.
   */
  const handleDeleteCampaign = useCallback(
    async (campaignId: UUID) => {
      setError(null)
      const finalizeDeletion = async () => {
        setCampaigns((prev) => prev.filter((campaign) => campaign.id !== campaignId))
        setSelectedCampaignId('')
        setCurrentSession(null)
        setEditorWorkspaceView('lobby')
        await refreshLobbyCampaignData({ showLoading: false, surfaceError: false })
        onCampaignDeleted?.(campaignId)
      }

      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/${campaignId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const message =
            typeof errorData.message === 'string' ? errorData.message : 'Failed to delete campaign'

          if (
            response.status === 404 ||
            (response.status === 409 && message.includes('already been deleted'))
          ) {
            await finalizeDeletion()
            return
          }

          throw new Error(message)
        }

        await finalizeDeletion()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      }
    },
    [
      apiUrl,
      fetchWithAuthGuard,
      onCampaignDeleted,
      refreshLobbyCampaignData,
      setCurrentSession,
      setCampaigns,
      setEditorWorkspaceView,
      setError,
      setSelectedCampaignId,
      token,
    ]
  )

  return {
    handleCreateCampaign,
    handleJoinCampaign,
    handleEnterCampaign,
    startCampaignSession,
    handleJoinRequest,
    handleWatchCampaign,
    handleLoadPendingJoinRequests,
    handleResolveJoinRequest,
    handleDeleteCampaign,
  }
}
