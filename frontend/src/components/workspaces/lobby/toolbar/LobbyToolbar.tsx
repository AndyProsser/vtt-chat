import { WorkspaceTopbar } from '@/components/workspaces/shared/toolbar/WorkspaceTopbar'
import { useCampaignWorkspaceTopbarActions } from '@/components/workspaces/shared/toolbar/useCampaignWorkspaceTopbarActions'
import type { LobbyConnectionStatus } from '@/types/session/lobby'

type LobbyToolbarProps = {
  themeMode: 'light' | 'dark'
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  connectionStatus: LobbyConnectionStatus
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onLogoff: () => void
}

export function LobbyToolbar(props: LobbyToolbarProps) {
  const { coreStateToneClass, toolbarActions } = useCampaignWorkspaceTopbarActions({
    isCreatingCampaign: props.isCreatingCampaign,
    isJoiningCampaign: props.isJoiningCampaign,
    onCreateCampaign: props.onCreateCampaign,
    onJoinCampaign: props.onJoinCampaign,
    coreWsState: props.connectionStatus.coreWsState,
  })

  const handleLogout = () => {
    const shouldLogout = window.confirm('Log out of VTT Chat?')
    if (!shouldLogout) {
      return
    }

    props.onLogoff()
  }

  return (
    <WorkspaceTopbar
      className="session-toolbar--lobby"
      dataTestId="session-lobby-toolbar"
      dataUiComponent="LobbyToolbar"
      brandAriaLabel="Lobby toolbar"
      extraActions={toolbarActions}
      themeMode={props.themeMode}
      onToggleTheme={props.onToggleTheme}
      onOpenUserSettings={props.onOpenUserSettings}
      onExit={handleLogout}
      exitIcon="logout"
      exitAriaLabel="Logoff"
      exitTooltipLabel="Logoff"
      connectionStatusColorKey={props.connectionStatus.statusColorKey}
      connectionStatusLabel={props.connectionStatus.label}
      connectionStatusRows={[
        {
          label: 'Core',
          value: props.connectionStatus.coreWsState,
          toneClassName: coreStateToneClass,
        },
      ]}
    />
  )
}
