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
  connectionStatus: ComponentProps<typeof LobbyView>['connectionStatus']
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
  onLoadPendingJoinRequests: ComponentProps<typeof LobbyView>['onLoadPendingJoinRequests']
  onResolveJoinRequest: ComponentProps<typeof LobbyView>['onResolveJoinRequest']
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
    connectionStatus: params.connectionStatus,
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
    onLoadPendingJoinRequests: params.onLoadPendingJoinRequests,
    onResolveJoinRequest: params.onResolveJoinRequest,
    onError: params.onError,
  }
}
