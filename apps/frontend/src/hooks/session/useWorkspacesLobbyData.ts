import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { CampaignLobbyStatsUpdatedPayload, EventEnvelope, UUID } from '@shared'
import { SessionScheduleType, formatScheduleLabel } from '@shared'
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
import { useStore } from '@/state/store'

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
  // CAMPAIGN:LIST_INVALIDATED is a lobby-scoped signal, but the backend also
  // broadcasts it on session state changes. While in a live session we defer the
  // reload (see handleCampaignListInvalidated) and flush it once the user is back
  // in a lobby context, so PAUSE/RESUME no longer refetch /api/campaigns mid-session.
  //
  // "Lobby context" = the session officially ended/idle (isGreenroom) OR the user
  // left the session before it ended (currentSessionId cleared by exit/leave).
  // Both must flush so a player who exits a still-ACTIVE session sees an up-to-date
  // campaign list.
  const currentSessionId = useStore((state) => state.currentSessionId)
  const isGreenroom = useStore((state) => state.isGreenroom)
  const inLobbyContext = currentSessionId === null || isGreenroom
  const pendingCampaignReloadRef = useRef(false)

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

        // Hydrate schedule slice for all campaigns — available to DM and players alike
        const { setCampaignSchedule } = useStore.getState()
        for (const c of nextCampaigns) {
          const schedLabel =
            c.sessionScheduleType &&
            c.sessionScheduleDay != null &&
            c.sessionScheduleHour != null &&
            c.sessionScheduleMinute != null &&
            c.sessionScheduleTz
              ? formatScheduleLabel({
                  type: c.sessionScheduleType as SessionScheduleType,
                  dayOfWeek: c.sessionScheduleDay,
                  nth: c.sessionScheduleNth ?? undefined,
                  hour: c.sessionScheduleHour,
                  minute: c.sessionScheduleMinute,
                  timezone: c.sessionScheduleTz,
                })
              : null
          setCampaignSchedule(c.id, {
            nextSessionDate: c.nextSessionDate ?? null,
            scheduleLabel: schedLabel,
            nextSessionIsManual: c.nextSessionIsManual ?? false,
          })
        }

        const pendingCampaignId = sessionStorage.getItem(LOBBY_CAMPAIGN_FOCUS_STORAGE_KEY)
        // DEV-HELPER: log campaigns returned from server to diagnose membership issues
        try {
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
    // In a live session the lobby campaign list isn't visible, and the backend
    // emits this on session-state changes — so reloading here would refetch
    // /api/campaigns on every PAUSE/RESUME and churn `campaigns` → `selectedCampaign`
    // → the session chrome. Defer until the user is back in a lobby context.
    const { currentSessionId: liveSessionId, isGreenroom: greenroomNow } = useStore.getState()
    if (liveSessionId !== null && !greenroomNow) {
      pendingCampaignReloadRef.current = true
      return
    }

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

  // Flush a campaign-list reload deferred during a live session once the user is
  // back in a lobby context — whether the session ended (isGreenroom) or the user
  // left it early (currentSessionId cleared) — so the list reflects any
  // invalidations that arrived mid-session without churning the chrome while in play.
  useEffect(() => {
    if (inLobbyContext && pendingCampaignReloadRef.current) {
      pendingCampaignReloadRef.current = false
      void loadLobbyCampaignData({ showLoading: false, surfaceError: false })
    }
  }, [inLobbyContext, loadLobbyCampaignData])

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
