import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { UUID } from '@shared'
import type {
  CampaignVisibility,
  ExtensionSyncPolicy,
  LateJoinPolicy,
  SupportedPlatform,
} from '@/constants/sessionUi.types'
import type { UseCampaignSettingsActions } from '../../hooks/useCampaignSettings'
import {
  applyCampaignSettingsPayload,
  buildCampaignSettingsSavePayload,
  syncCampaignSummaryFromSettings,
} from '@/utils/session/sessionSettings'
import type { CampaignSettingsPayload, CampaignSummary } from '@/types/session/campaign'
import type { Session as SessionRecord } from '@/types/session'
import { getLatestSessionChronologically, normalizeSessionRecord } from '@/utils/session/workspaces'
import { createCampaignSettingsController } from '@/utils/session/sessionController'
import type { EditorWorkspaceView } from '@/types/workspaces'

type UseWorkspacesSettingsOrchestrationParams = {
  apiUrl: string
  token: string
  fetchWithAuthGuard: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  campaignSettingsController: ReturnType<typeof createCampaignSettingsController>
  campaignSettingsActions: UseCampaignSettingsActions
  currentSession: SessionRecord | null
  sessionSettingsName: string
  sessionSettingsPlannedDurationMinutes: number
  setIsSessionSettingsSaving: Dispatch<SetStateAction<boolean>>
  updateSession: (sessionId: UUID, session: SessionRecord) => void
  settingsCampaignId: UUID | ''
  settingsName: string
  settingsDescription: string
  settingsPosterUrl: string
  settingsVisibility: CampaignVisibility
  settingsSpectatorsEnabled: boolean
  settingsSpectatorMax: number
  settingsSpectatorWaitlistEnabled: boolean
  settingsSpectatorReconnectGraceSecs: number
  settingsExtensionSyncPolicy: ExtensionSyncPolicy
  settingsPostSessionChatEnabled: boolean
  settingsPostSessionChatDurationMinutes: number
  settingsLateJoinPolicy: LateJoinPolicy
  settingsLateJoinGraceMinutes: number
  settingsDefaultSessionDurationMins: number
  settingsDmAutoTargetOnFirstPlayerJoin: boolean
  settingsSupportedPlatforms: SupportedPlatform[]
  settingsData: CampaignSettingsPayload | null
  setCampaigns: Dispatch<SetStateAction<CampaignSummary[]>>
  setSelectedCampaignId: Dispatch<SetStateAction<UUID | ''>>
  setEditorWorkspaceView: Dispatch<SetStateAction<EditorWorkspaceView>>
  setError: Dispatch<SetStateAction<string | null>>
  setLobbyNotice: Dispatch<SetStateAction<string | null>>
}

export function useWorkspacesSettingsOrchestration(
  params: UseWorkspacesSettingsOrchestrationParams
) {
  const {
    apiUrl,
    token,
    fetchWithAuthGuard,
    campaignSettingsController,
    campaignSettingsActions,
    currentSession,
    sessionSettingsName,
    sessionSettingsPlannedDurationMinutes,
    setIsSessionSettingsSaving,
    updateSession,
    settingsDmAutoTargetOnFirstPlayerJoin,
    settingsCampaignId,
    settingsName,
    settingsDescription,
    settingsPosterUrl,
    settingsVisibility,
    settingsSpectatorsEnabled,
    settingsSpectatorMax,
    settingsSpectatorWaitlistEnabled,
    settingsSpectatorReconnectGraceSecs,
    settingsExtensionSyncPolicy,
    settingsPostSessionChatEnabled,
    settingsPostSessionChatDurationMinutes,
    settingsLateJoinPolicy,
    settingsLateJoinGraceMinutes,
    settingsDefaultSessionDurationMins,
    settingsSupportedPlatforms,
    settingsData,
    setCampaigns,
    setSelectedCampaignId,
    setEditorWorkspaceView,
    setError,
    setLobbyNotice,
  } = params

  const loadCampaignSettings = useCallback(
    async (campaignId: UUID): Promise<CampaignSettingsPayload | null> => {
      campaignSettingsActions.setIsSettingsLoading(true)
      setError(null)

      const result = await campaignSettingsController.loadCampaignSettings(campaignId, {
        onSettingsLoaded: (settings) => {
          applyCampaignSettingsPayload(campaignSettingsActions, settings)
        },
        onError: (message) => setError(message),
      })

      campaignSettingsActions.setIsSettingsLoading(false)
      return result
    },
    [campaignSettingsActions, campaignSettingsController, setError]
  )
  const loadDmVoiceTargetingSetting = useCallback(
    async (campaignId: UUID): Promise<boolean | null> => {
      campaignSettingsActions.setIsDmVoiceTargetingSettingLoading(true)

      const result = await campaignSettingsController.loadDmVoiceTargetingSetting(campaignId, {
        onDmVoiceTargetingLoaded: (enabled) => {
          campaignSettingsActions.setSettingsDmAutoTargetOnFirstPlayerJoin(enabled)
        },
      })

      campaignSettingsActions.setIsDmVoiceTargetingSettingLoading(false)
      return result
    },
    [campaignSettingsActions, campaignSettingsController]
  )
  const saveDmVoiceTargetingSetting = useCallback(
    async (campaignId: UUID) => {
      campaignSettingsActions.setIsDmVoiceTargetingSettingSaving(true)
      setError(null)

      await campaignSettingsController.saveDmVoiceTargetingSetting(
        campaignId,
        settingsDmAutoTargetOnFirstPlayerJoin,
        {
          onNotice: (message) => setLobbyNotice(message),
          onError: (message) => setError(message),
        }
      )

      campaignSettingsActions.setIsDmVoiceTargetingSettingSaving(false)
    },
    [
      campaignSettingsActions,
      campaignSettingsController,
      setError,
      setLobbyNotice,
      settingsDmAutoTargetOnFirstPlayerJoin,
    ]
  )
  const saveSessionSettings = useCallback(async () => {
    if (!currentSession) {
      return
    }

    setIsSessionSettingsSaving(true)
    setError(null)

    try {
      const response = await fetchWithAuthGuard(`${apiUrl}/api/session/${currentSession.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: sessionSettingsName,
          plannedDurationMinutes: sessionSettingsPlannedDurationMinutes,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save session settings')
      }

      const payload = (await response.json()) as { session: SessionRecord }
      if (payload.session) {
        updateSession(payload.session.id, normalizeSessionRecord(payload.session))
      }
      setLobbyNotice('Session settings saved.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save session settings'
      setError(message)
    } finally {
      setIsSessionSettingsSaving(false)
    }
  }, [
    apiUrl,
    currentSession,
    fetchWithAuthGuard,

    sessionSettingsName,
    sessionSettingsPlannedDurationMinutes,
    setError,
    setIsSessionSettingsSaving,
    setLobbyNotice,
    token,
    updateSession,
  ])

  const loadCampaignSettingsSessionContext = useCallback(
    async (campaignId: UUID, authoritativeLatestSessionId: UUID | '' = '') => {
      try {
        const sessions = await campaignSettingsController.fetchCampaignSessions(campaignId)
        campaignSettingsActions.setSettingsCampaignSessions(sessions)

        if (
          authoritativeLatestSessionId &&
          sessions.some((session) => session.id === authoritativeLatestSessionId)
        ) {
          campaignSettingsActions.setSettingsReferenceSessionId(authoritativeLatestSessionId)
          return
        }

        const latestSession = getLatestSessionChronologically(sessions)
        campaignSettingsActions.setSettingsReferenceSessionId(latestSession?.id || '')
      } catch {
        campaignSettingsActions.setSettingsCampaignSessions([])
        if (!authoritativeLatestSessionId) {
          campaignSettingsActions.setSettingsReferenceSessionId('')
        }
      }
    },
    [campaignSettingsActions, campaignSettingsController]
  )

  const openEditorCampaignWorkspace = useCallback(
    (campaignId: UUID) => {
      setSelectedCampaignId(campaignId)
      setEditorWorkspaceView('editor')

      campaignSettingsActions.setSettingsCampaignId(campaignId)
      campaignSettingsActions.setSettingsHomeTab('home')

      void (async () => {
        const settingsPayload = await loadCampaignSettings(campaignId)
        const authoritativeLatestSessionId = (settingsPayload?.latestSessionId || '') as UUID | ''
        await loadCampaignSettingsSessionContext(campaignId, authoritativeLatestSessionId)
      })()
    },
    [
      campaignSettingsActions,
      loadCampaignSettings,
      loadCampaignSettingsSessionContext,
      setEditorWorkspaceView,
      setSelectedCampaignId,
    ]
  )

  const saveCampaignSettings = useCallback(async () => {
    if (!settingsCampaignId) {
      return
    }

    setError(null)
    campaignSettingsActions.setIsSettingsSaving(true)

    const normalizedPayload = buildCampaignSettingsSavePayload({
      settingsName,
      settingsDescription,
      settingsPosterUrl,
      settingsVisibility,
      settingsSpectatorsEnabled,
      settingsSpectatorMax,
      settingsSpectatorWaitlistEnabled,
      settingsSpectatorReconnectGraceSecs,
      settingsExtensionSyncPolicy,
      settingsPostSessionChatEnabled,
      settingsPostSessionChatDurationMinutes,
      settingsDmAutoTargetOnFirstPlayerJoin,
      settingsLateJoinPolicy,
      settingsLateJoinGraceMinutes,
      settingsDefaultSessionDurationMins,
      settingsSupportedPlatforms,
    })

    try {
      const response = await fetchWithAuthGuard(
        `${apiUrl}/api/campaigns/${settingsCampaignId}/settings`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(normalizedPayload),
        }
      )

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save campaign settings')
      }

      const payload = (await response.json()) as { campaign: CampaignSettingsPayload }
      applyCampaignSettingsPayload(campaignSettingsActions, payload.campaign)

      setCampaigns((prev) => syncCampaignSummaryFromSettings(prev, payload.campaign))
      setLobbyNotice('Campaign settings saved.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save campaign settings'
      setError(message)
    } finally {
      campaignSettingsActions.setIsSettingsSaving(false)
    }
  }, [
    apiUrl,
    campaignSettingsActions,
    fetchWithAuthGuard,
    setCampaigns,
    setError,
    setLobbyNotice,
    settingsCampaignId,
    settingsDescription,
    settingsDmAutoTargetOnFirstPlayerJoin,
    settingsExtensionSyncPolicy,
    settingsLateJoinGraceMinutes,
    settingsLateJoinPolicy,
    settingsDefaultSessionDurationMins,
    settingsSupportedPlatforms,
    settingsName,
    settingsPostSessionChatDurationMinutes,
    settingsPostSessionChatEnabled,
    settingsPosterUrl,
    settingsSpectatorMax,
    settingsSpectatorReconnectGraceSecs,
    settingsSpectatorWaitlistEnabled,
    settingsSpectatorsEnabled,
    settingsVisibility,
    token,
  ])

  const handleSaveCampaignInfoPanel = useCallback(
    async (
      campaignId: UUID,
      updates: {
        name: string
        description: string
        posterUrl: string | null
        integrationSyncPolicy: 'ALLOW' | 'DM_ONLY' | 'NONE'
      }
    ) => {
      setError(null)

      const response = await fetchWithAuthGuard(`${apiUrl}/api/campaigns/${campaignId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: updates.name,
          description: updates.description,
          posterUrl: updates.posterUrl,
          extensionSyncPolicy: updates.integrationSyncPolicy,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Failed to save campaign info')
      }

      const payload = (await response.json()) as { campaign: CampaignSettingsPayload }

      setCampaigns((prev) => syncCampaignSummaryFromSettings(prev, payload.campaign))

      if (settingsData?.id === payload.campaign.id) {
        campaignSettingsActions.setSettingsData(payload.campaign)
        campaignSettingsActions.setSettingsName(payload.campaign.name)
        campaignSettingsActions.setSettingsDescription(payload.campaign.description || '')
        campaignSettingsActions.setSettingsPosterUrl(payload.campaign.posterUrl || '')
        campaignSettingsActions.setSettingsExtensionSyncPolicy(
          payload.campaign.extensionSyncPolicy === 'DM_AND_PLAYERS'
            ? 'ALLOW'
            : payload.campaign.extensionSyncPolicy
        )
      }

      setLobbyNotice('Campaign information saved.')
    },
    [
      apiUrl,
      campaignSettingsActions,
      fetchWithAuthGuard,
      setCampaigns,
      setError,
      setLobbyNotice,
      settingsData?.id,
      token,
    ]
  )

  return {
    loadCampaignSettings,
    loadDmVoiceTargetingSetting,
    saveDmVoiceTargetingSetting,
    saveSessionSettings,
    openEditorCampaignWorkspace,
    saveCampaignSettings,
    handleSaveCampaignInfoPanel,
  }
}
