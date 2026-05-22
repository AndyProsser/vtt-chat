import type { ComponentProps } from 'react'
import { LobbyView } from '@/components/workspaces/lobby/LobbyView'
import type { EditorWorkspaceView } from '@/types/workspaces'

type BuildLobbyWorkspacePropsParams = {
  hasSessionSelected: boolean
  editorWorkspaceView: EditorWorkspaceView
  campaigns: ComponentProps<typeof LobbyView>['campaigns']
  discoverableCampaigns: ComponentProps<typeof LobbyView>['discoverableCampaigns']
  lobbyStats: ComponentProps<typeof LobbyView>['lobbyStats']
  selectedCampaignId: ComponentProps<typeof LobbyView>['selectedCampaignId']
  isLoadingCampaigns: boolean
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  themeMode: 'light' | 'dark'
  connectionStatus: {
    statusColorKey: string
    label: string
    coreWsState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'RECONNECTING'
  }
  onSelectCampaign: ComponentProps<typeof LobbyView>['onSelectCampaign']
  onCreateCampaign: ComponentProps<typeof LobbyView>['onCreateCampaign']
  onJoinCampaign: ComponentProps<typeof LobbyView>['onJoinCampaign']
  onToggleTheme: ComponentProps<typeof LobbyView>['onToggleTheme']
  onOpenUserSettings: ComponentProps<typeof LobbyView>['onOpenUserSettings']
  onLogoff: ComponentProps<typeof LobbyView>['onLogoff']
  onOpenCampaignSettings: ComponentProps<typeof LobbyView>['onOpenCampaignSettings']
  onEnterCampaign: ComponentProps<typeof LobbyView>['onEnterCampaign']
  onJoinRequest: ComponentProps<typeof LobbyView>['onJoinRequest']
  onWatchCampaign: ComponentProps<typeof LobbyView>['onWatchCampaign']
  onError: ComponentProps<typeof LobbyView>['onError']
}

export function buildLobbyWorkspaceProps(
  params: BuildLobbyWorkspacePropsParams
): ComponentProps<typeof LobbyView> | null {
  if (params.hasSessionSelected || params.editorWorkspaceView !== 'lobby') {
    return null
  }

  return {
    campaigns: params.campaigns,
    discoverableCampaigns: params.discoverableCampaigns,
    lobbyStats: params.lobbyStats,
    selectedCampaignId: params.selectedCampaignId,
    isLoadingCampaigns: params.isLoadingCampaigns,
    isCreatingCampaign: params.isCreatingCampaign,
    isJoiningCampaign: params.isJoiningCampaign,
    themeMode: params.themeMode,
    connectionStatus: {
      statusColorKey: params.connectionStatus.statusColorKey,
      label: params.connectionStatus.label,
      coreWsState: params.connectionStatus.coreWsState as
        | 'CONNECTED'
        | 'CONNECTING'
        | 'DISCONNECTED',
    },
    onSelectCampaign: params.onSelectCampaign,
    onCreateCampaign: params.onCreateCampaign,
    onJoinCampaign: params.onJoinCampaign,
    onToggleTheme: params.onToggleTheme,
    onOpenUserSettings: params.onOpenUserSettings,
    onLogoff: params.onLogoff,
    onOpenCampaignSettings: params.onOpenCampaignSettings,
    onEnterCampaign: params.onEnterCampaign,
    onJoinRequest: params.onJoinRequest,
    onWatchCampaign: params.onWatchCampaign,
    onError: params.onError,
  }
}
