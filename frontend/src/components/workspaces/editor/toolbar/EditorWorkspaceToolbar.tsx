import { WorkspaceTopbar } from '@/components/workspaces/shared/toolbar/WorkspaceTopbar'
import { InvitePopoverWidget } from '@/components/workspaces/shared/common/InvitePopoverWidget'
import { useEditorWorkspaceToolbarActions } from './useEditorWorkspaceToolbarActions'
import type { LobbyConnectionStatus } from '@/types/session/lobby'

type EditorWorkspaceToolbarProps = {
  themeMode: 'light' | 'dark'
  dataUiState?: string
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  connectionStatus: LobbyConnectionStatus
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onReturnToLobby: () => void
  showInviteWidget: boolean
  joinUrl: string
  spectatorsEnabled: boolean
  watchUrl: string
  canRefreshInvites?: boolean
  onCopyInviteUrl: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  onReissueInvite: (inviteType: 'PLAYER' | 'SPECTATOR') => void
  isInviteReissuing?: boolean
}

export function EditorWorkspaceToolbar(props: EditorWorkspaceToolbarProps) {
  const { coreStateToneClass } = useEditorWorkspaceToolbarActions({
    isCreatingCampaign: props.isCreatingCampaign,
    isJoiningCampaign: props.isJoiningCampaign,
    onCreateCampaign: props.onCreateCampaign,
    onJoinCampaign: props.onJoinCampaign,
    coreWsState: props.connectionStatus.coreWsState,
  })

  const inviteActions = props.showInviteWidget ? (
    <InvitePopoverWidget
      show={props.showInviteWidget}
      joinUrl={props.joinUrl}
      spectatorsEnabled={props.spectatorsEnabled}
      watchUrl={props.watchUrl}
      canRefreshInvites={props.canRefreshInvites}
      onCopyInviteUrl={props.onCopyInviteUrl}
      onReissueInvite={props.onReissueInvite}
      isInviteReissuing={props.isInviteReissuing}
    />
  ) : undefined

  return (
    <WorkspaceTopbar
      className="session-toolbar--lobby"
      dataTestId="session-lobby-toolbar"
      dataUiComponent="EditorWorkspaceToolbar"
      dataUiState={props.dataUiState}
      brandAriaLabel="Editor toolbar"
      extraActions={inviteActions}
      themeMode={props.themeMode}
      onToggleTheme={props.onToggleTheme}
      onOpenUserSettings={props.onOpenUserSettings}
      onExit={props.onReturnToLobby}
      exitIcon="arrow_back"
      exitAriaLabel="Return to lobby"
      exitTooltipLabel="Return"
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
