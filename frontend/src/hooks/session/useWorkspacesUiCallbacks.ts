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

  return {
    handleToggleTheme,
    handleOpenCreateCampaignModal,
    handleOpenJoinCampaignModal,
    handleOpenUserSettingsModal,
    handleBackToLobbyWorkspace,
    handleLaunchFromEditor,
  }
}
