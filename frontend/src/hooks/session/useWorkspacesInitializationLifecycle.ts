import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { UUID } from '@shared'
import type { Session as SessionRecord } from '@/types/session'

type UseWorkspacesInitializationLifecycleParams = {
  currentSessionId: UUID | null
  currentSession: SessionRecord | null
  isLoadingCampaigns: boolean
  isCampaignRestorePending: boolean
  hasSignaledReadyRef: MutableRefObject<boolean>
  onReady?: () => void
  loadUserCharacters: () => Promise<void>
  selectedCampaignId: UUID | null
  loadDmVoiceTargetingSetting: (campaignId: UUID) => Promise<void>
}

/**
 * Runs one-time readiness signaling and initialization data loads for workspace entry.
 */
export function useWorkspacesInitializationLifecycle({
  currentSessionId,
  currentSession,
  isLoadingCampaigns,
  isCampaignRestorePending,
  hasSignaledReadyRef,
  onReady,
  loadUserCharacters,
  selectedCampaignId,
  loadDmVoiceTargetingSetting,
}: UseWorkspacesInitializationLifecycleParams) {
  useEffect(() => {
    const hasSessionSurface = Boolean(currentSessionId) && Boolean(currentSession)
    const hasLobbySurface = !currentSessionId

    if (
      hasSignaledReadyRef.current ||
      isLoadingCampaigns ||
      isCampaignRestorePending ||
      (!hasSessionSurface && !hasLobbySurface)
    ) {
      return
    }

    hasSignaledReadyRef.current = true
    onReady?.()
  }, [
    currentSession,
    currentSessionId,
    hasSignaledReadyRef,
    isCampaignRestorePending,
    isLoadingCampaigns,
    onReady,
  ])

  useEffect(() => {
    void loadUserCharacters()
  }, [loadUserCharacters])

  useEffect(() => {
    if (!selectedCampaignId || !currentSession?.id) {
      return
    }

    void loadDmVoiceTargetingSetting(selectedCampaignId)
  }, [currentSession?.id, loadDmVoiceTargetingSetting, selectedCampaignId])
}
