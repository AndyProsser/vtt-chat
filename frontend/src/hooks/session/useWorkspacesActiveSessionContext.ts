import { useEffect, type RefObject } from 'react'
import type { UUID } from '@shared'
import {
  ACTIVE_SESSION_CONTEXT_STORAGE_KEY,
  LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY,
} from '@/constants/workspaces.constants'
import type { Session as SessionRecord } from '@/types/session'
import type { CampaignSummary } from '@/types/session/campaign'
import type { ActiveSessionContext } from '@/types/session/workspaces'
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from '@/utils/session/workspaces'

type UseWorkspacesActiveSessionContextParams = {
  isLoadingCampaigns: boolean
  currentSessionId: UUID | null
  lobbyAutoEnterTriggeredRef: RefObject<boolean>
  campaigns: CampaignSummary[]
  clearPersistedActiveSessionContext: () => void
  setIsCampaignRestorePending: (value: boolean) => void
  handleEnterCampaign: (campaignId: UUID, preferredSessionId?: UUID) => Promise<void>
  currentSession: SessionRecord | null
  selectedCampaignId: UUID | ''
}

/**
 * Restores pending campaign/session context from storage and persists active context
 * whenever the current session binding changes.
 */
export function useWorkspacesActiveSessionContext(params: UseWorkspacesActiveSessionContextParams) {
  const {
    isLoadingCampaigns,
    currentSessionId,
    lobbyAutoEnterTriggeredRef,
    campaigns,
    clearPersistedActiveSessionContext,
    setIsCampaignRestorePending,
    handleEnterCampaign,
    currentSession,
    selectedCampaignId,
  } = params

  useEffect(() => {
    if (isLoadingCampaigns || currentSessionId || lobbyAutoEnterTriggeredRef.current) {
      return
    }

    setIsCampaignRestorePending(true)

    const pendingAutoEnterCampaignId = sessionStorage.getItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY)
    const rawActiveSessionContext =
      sessionStorage.getItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY) ||
      safeLocalStorageGetItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY)

    let activeSessionContext: ActiveSessionContext | null = null
    if (rawActiveSessionContext) {
      try {
        const parsed = JSON.parse(rawActiveSessionContext) as Partial<ActiveSessionContext>
        if (parsed.campaignId && parsed.sessionId) {
          activeSessionContext = {
            campaignId: parsed.campaignId,
            sessionId: parsed.sessionId,
          }

          // Keep session storage warm after hard refresh if local storage carried context.
          sessionStorage.setItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY, rawActiveSessionContext)
        }
      } catch {
        clearPersistedActiveSessionContext()
      }
    }

    const restoreCampaignId =
      activeSessionContext?.campaignId || (pendingAutoEnterCampaignId as UUID | null)
    if (!restoreCampaignId) {
      setIsCampaignRestorePending(false)
      return
    }

    const pendingCampaign = campaigns.find((campaign) => campaign.id === restoreCampaignId)

    sessionStorage.removeItem(LOBBY_AUTO_ENTER_CAMPAIGN_STORAGE_KEY)

    if (!pendingCampaign) {
      clearPersistedActiveSessionContext()
      setIsCampaignRestorePending(false)
      return
    }

    lobbyAutoEnterTriggeredRef.current = true
    void (async () => {
      try {
        await handleEnterCampaign(pendingCampaign.id, activeSessionContext?.sessionId)
      } finally {
        setIsCampaignRestorePending(false)
      }
    })()
  }, [
    campaigns,
    clearPersistedActiveSessionContext,
    currentSessionId,
    handleEnterCampaign,
    isLoadingCampaigns,
    lobbyAutoEnterTriggeredRef,
    setIsCampaignRestorePending,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!currentSession || !selectedCampaignId) {
      return
    }

    const context: ActiveSessionContext = {
      campaignId: selectedCampaignId,
      sessionId: currentSession.id,
    }

    const serializedContext = JSON.stringify(context)
    window.sessionStorage.setItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY, serializedContext)
    safeLocalStorageSetItem(ACTIVE_SESSION_CONTEXT_STORAGE_KEY, serializedContext)
  }, [currentSession, selectedCampaignId])
}
