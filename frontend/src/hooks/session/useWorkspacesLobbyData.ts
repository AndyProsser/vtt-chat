import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { CampaignLobbyStatsUpdatedPayload, EventEnvelope, UUID } from '@shared'
import type { Session as SessionRecord } from '@/types/session'
import type { CampaignSummary } from '@/types/session/campaign'
import type { ApiDiscoverableCampaign, ApiPlatformStatusResponse } from '@/types/session/workspaces'
import { formatDurationCompact } from '@/utils/session/workspaces'
import {
  LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY,
  LOBBY_NOTICE_STORAGE_KEY,
} from '@/constants/workspaces.constants'
import {
  INITIAL_LOBBY_STATS,
  LOBBY_CAMPAIGN_LIST_RELOAD_DEBOUNCE_MS,
} from '@/constants/lobby.constants'

const CAMPAIGN_INVALIDATION_SUPPRESS_AFTER_LOAD_MS = 1500

export type UseWorkspacesLobbyDataParams = {
  apiUrl: string
  token: string
  userAuthType?: 'FULL' | 'GUEST'
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  clearSessions: () => void
  replaceSessions: (sessions: SessionRecord[]) => void
  fetchCampaignSessionsData: (campaignId: UUID) => Promise<SessionRecord[]>
  setError: Dispatch<SetStateAction<string | null>>
  setLobbyNotice: Dispatch<SetStateAction<string | null>>
}

/**
 * Owns lobby campaign discovery/loading and lobby stats refresh logic.
 * Exposes websocket callback handlers so the shell can pass stable lobby handlers into useWebSocket.
 */
export function useWorkspacesLobbyData(params: UseWorkspacesLobbyDataParams) {
  const {
    apiUrl,
    token,
    userAuthType,
    fetchWithAuthGuard,
    clearSessions,
    replaceSessions,
    fetchCampaignSessionsData,
    setError,
    setLobbyNotice,
  } = params

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [discoverableCampaigns, setDiscoverableCampaigns] = useState<CampaignSummary[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<UUID | ''>('')
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(true)
  const [lobbyStats, setLobbyStats] = useState(INITIAL_LOBBY_STATS)
  const [partyPresenceRefreshVersion, setPartyPresenceRefreshVersion] = useState(0)
  const lobbyCampaignReloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastLobbyCampaignLoadAtRef = useRef<number>(0)

  const applyLobbyStatsSnapshot = useCallback((snapshot: CampaignLobbyStatsUpdatedPayload) => {
    setLobbyStats({
      activeSessions: Math.max(0, Math.floor(snapshot.activeSessions || 0)),
      connectedPlayersAndDms: Math.max(0, Math.floor(snapshot.connectedPlayersAndDms || 0)),
      connectedSpectators: Math.max(0, Math.floor(snapshot.connectedSpectators || 0)),
      peakConcurrentUsers24h: Math.max(0, Math.floor(snapshot.peakConcurrentUsers24h || 0)),
      totalTimePlayedLabel: formatDurationCompact(snapshot.totalEndedSessionDurationMs || 0),
      activeCampaigns: Math.max(0, Math.floor(snapshot.activeCampaigns || 0)),
      pausedCampaigns: Math.max(0, Math.floor(snapshot.pausedCampaigns || 0)),
      averageSessionDurationLabel: formatDurationCompact(
        snapshot.averageEndedSessionDurationMs || 0
      ),
    })
  }, [])

  const loadCampaigns = useCallback(
    async ({ showLoading = true, surfaceError = true } = {}) => {
      if (showLoading) {
        setIsLoadingCampaigns(true)
      }
      if (surfaceError) {
        setError(null)
      }

      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to load campaigns')
        }

        const data = await response.json()
        const nextCampaigns = (data.campaigns || []) as CampaignSummary[]
        const pendingCampaignId = sessionStorage.getItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY)
        // DEV-HELPER: log campaigns returned from server to diagnose membership issues
        try {
          // eslint-disable-next-line no-console
          console.debug(
            'Lobby: loaded campaigns',
            nextCampaigns.map((c) => ({
              id: c.id,
              name: c.name,
              isMember: (c as any).isMember,
              memberRole: (c as any).memberRole,
            }))
          )
        } catch {
          // ignore
        }
        const pendingNotice = sessionStorage.getItem(LOBBY_NOTICE_STORAGE_KEY)
        setCampaigns(nextCampaigns)

        if (pendingNotice) {
          setLobbyNotice(pendingNotice)
          sessionStorage.removeItem(LOBBY_NOTICE_STORAGE_KEY)
        }

        if (nextCampaigns.length > 0) {
          const pendingCampaign = pendingCampaignId
            ? nextCampaigns.find((campaign) => campaign.id === pendingCampaignId)
            : null

          if (pendingCampaign) {
            setSelectedCampaignId(pendingCampaign.id)
          } else {
            setSelectedCampaignId((prev) => prev || (nextCampaigns[0].id as UUID))
          }
        } else {
          setSelectedCampaignId('')
          clearSessions()
        }

        sessionStorage.removeItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY)
        return nextCampaigns
      } catch (err) {
        if (surfaceError) {
          const message = err instanceof Error ? err.message : 'An error occurred'
          setError(message)
        }
        return null
      } finally {
        if (showLoading) {
          setIsLoadingCampaigns(false)
        }
      }
    },
    [apiUrl, clearSessions, fetchWithAuthGuard, setError, setLobbyNotice, token]
  )

  const loadDiscoverableCampaigns = useCallback(
    async ({ surfaceError = false } = {}) => {
      if (userAuthType === 'GUEST') {
        setDiscoverableCampaigns([])
        return []
      }

      try {
        const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/discover`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.message || 'Failed to load discoverable campaigns')
        }

        const data = (await response.json()) as { campaigns?: ApiDiscoverableCampaign[] }
        const nextCampaigns = (data.campaigns || []).map((campaign) => ({
          ...campaign,
          latestSessionState: campaign.activeSessionState ?? null,
          isMember: false,
        })) as CampaignSummary[]

        setDiscoverableCampaigns(nextCampaigns)
        return nextCampaigns
      } catch (err) {
        setDiscoverableCampaigns([])
        if (surfaceError) {
          const message = err instanceof Error ? err.message : 'An error occurred'
          setError(message)
        }
        return null
      }
    },
    [apiUrl, fetchWithAuthGuard, setError, token, userAuthType]
  )

  const loadLobbyCampaignData = useCallback(
    async ({ showLoading = true, surfaceError = true } = {}) => {
      const nextCampaigns = await loadCampaigns({ showLoading, surfaceError })

      if (nextCampaigns) {
        lastLobbyCampaignLoadAtRef.current = Date.now()
      }

      // Discover campaigns are secondary UX data. Never let discover failures
      // block or delay the member campaign list from rendering.
      void loadDiscoverableCampaigns({ surfaceError: false })

      return nextCampaigns
    },
    [loadCampaigns, loadDiscoverableCampaigns]
  )

  const loadLobbyStats = useCallback(async () => {
    try {
      const statusResponse = await fetchWithAuthGuard(`${apiUrl}/api/platform/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!statusResponse.ok) {
        const errorData = await statusResponse.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to load lobby stats')
      }

      const statusPayload = (await statusResponse.json()) as ApiPlatformStatusResponse
      if (statusPayload.lobbyStats) {
        applyLobbyStatsSnapshot(statusPayload.lobbyStats)
        return
      }

      setLobbyStats((current) => ({
        ...current,
        activeSessions:
          typeof statusPayload.activeSessions === 'number'
            ? Math.max(0, Math.floor(statusPayload.activeSessions))
            : current.activeSessions,
        peakConcurrentUsers24h:
          typeof statusPayload.peakConcurrentUsers24h === 'number'
            ? Math.max(0, Math.floor(statusPayload.peakConcurrentUsers24h))
            : current.peakConcurrentUsers24h,
      }))
    } catch {
      // Keep the existing lobby snapshot when refresh fails.
    }
  }, [apiUrl, applyLobbyStatsSnapshot, fetchWithAuthGuard, token])

  const handleCampaignListInvalidated = useCallback(() => {
    if (
      Date.now() - lastLobbyCampaignLoadAtRef.current <
      CAMPAIGN_INVALIDATION_SUPPRESS_AFTER_LOAD_MS
    ) {
      return
    }

    if (lobbyCampaignReloadTimeoutRef.current) {
      clearTimeout(lobbyCampaignReloadTimeoutRef.current)
    }

    lobbyCampaignReloadTimeoutRef.current = setTimeout(() => {
      void loadLobbyCampaignData({ showLoading: false, surfaceError: false })
    }, LOBBY_CAMPAIGN_LIST_RELOAD_DEBOUNCE_MS)
  }, [loadLobbyCampaignData])

  const handleLobbyStatsUpdated = useCallback(
    (event: EventEnvelope) => {
      const payload = event.payload as Partial<CampaignLobbyStatsUpdatedPayload>
      if (typeof payload.activeSessions !== 'number') {
        return
      }

      applyLobbyStatsSnapshot(payload as CampaignLobbyStatsUpdatedPayload)
    },
    [applyLobbyStatsSnapshot]
  )

  const handlePartyPresenceUpdated = useCallback(
    (event: EventEnvelope) => {
      const payload = event.payload as { campaignId?: UUID }
      if (!payload.campaignId || payload.campaignId !== selectedCampaignId) {
        return
      }

      setPartyPresenceRefreshVersion((current) => current + 1)
    },
    [selectedCampaignId]
  )

  useEffect(() => {
    return () => {
      if (lobbyCampaignReloadTimeoutRef.current) {
        clearTimeout(lobbyCampaignReloadTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void Promise.all([loadLobbyCampaignData(), loadLobbyStats()])
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [loadLobbyCampaignData, loadLobbyStats])

  useEffect(() => {
    const loadCampaignSessions = async () => {
      if (!selectedCampaignId) {
        clearSessions()
        return
      }

      setError(null)

      try {
        const nextSessions = await fetchCampaignSessionsData(selectedCampaignId)
        replaceSessions(nextSessions)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred'
        setError(message)
      }
    }

    void loadCampaignSessions()
  }, [clearSessions, fetchCampaignSessionsData, replaceSessions, selectedCampaignId, setError])

  return {
    campaigns,
    setCampaigns,
    discoverableCampaigns,
    selectedCampaignId,
    setSelectedCampaignId,
    isLoadingCampaigns,
    lobbyStats,
    partyPresenceRefreshVersion,
    loadLobbyCampaignData,
    handleCampaignListInvalidated,
    handleLobbyStatsUpdated,
    handlePartyPresenceUpdated,
  }
}
