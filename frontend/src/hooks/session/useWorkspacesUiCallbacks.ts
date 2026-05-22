import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { UUID } from '@shared'
import type { EditorWorkspaceView } from '@/types/workspaces'

type UseWorkspacesUiCallbacksParams = {
  toggleThemeMode: () => void
  setShowCreateCampaignModal: Dispatch<SetStateAction<boolean>>
  setShowJoinCampaignModal: Dispatch<SetStateAction<boolean>>
  setShowUserSettingsModal: Dispatch<SetStateAction<boolean>>
  setEditorWorkspaceView: Dispatch<SetStateAction<EditorWorkspaceView>>
  setError: Dispatch<SetStateAction<string | null>>
  handleEnterCampaign: (campaignId: UUID) => Promise<void>
}

/**
 * Provides stable UI callback wrappers for modal toggles and lightweight lobby/editor actions.
 */
export function useWorkspacesUiCallbacks({
  toggleThemeMode,
  setShowCreateCampaignModal,
  setShowJoinCampaignModal,
  setShowUserSettingsModal,
  setEditorWorkspaceView,
  setError,
  handleEnterCampaign,
}: UseWorkspacesUiCallbacksParams) {
  const handleToggleTheme = toggleThemeMode

  const handleOpenCreateCampaignModal = useCallback(() => {
    setShowCreateCampaignModal(true)
  }, [setShowCreateCampaignModal])

  const handleOpenJoinCampaignModal = useCallback(() => {
    setShowJoinCampaignModal(true)
  }, [setShowJoinCampaignModal])

  const handleOpenUserSettingsModal = useCallback(() => {
    setShowUserSettingsModal(true)
  }, [setShowUserSettingsModal])

  const handleBackToLobbyWorkspace = useCallback(() => {
    setEditorWorkspaceView('lobby')
  }, [setEditorWorkspaceView])

  const handleLaunchFromEditor = useCallback(
    (campaignId: UUID) => {
      setEditorWorkspaceView('lobby')
      void handleEnterCampaign(campaignId)
    },
    [handleEnterCampaign, setEditorWorkspaceView]
  )

  const handleJoinRequestUnavailable = useCallback(() => {
    setError('Join request flow is not wired into Workspaces yet.')
  }, [setError])

  const handleWatchUnavailable = useCallback(() => {
    setError('Watch flow is not wired into Workspaces yet.')
  }, [setError])

  return {
    handleToggleTheme,
    handleOpenCreateCampaignModal,
    handleOpenJoinCampaignModal,
    handleOpenUserSettingsModal,
    handleBackToLobbyWorkspace,
    handleLaunchFromEditor,
    handleJoinRequestUnavailable,
    handleWatchUnavailable,
  }
}
