import { WorkspaceToolbar } from '@/components/workspaces/shared/toolbar/WorkspaceToolbar'
import { InvitePopoverWidget } from '@/components/workspaces/shared/toolbar/InvitePopoverWidget'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import { useEditorWorkspaceToolbarActions } from '@/hooks/workspaces/useEditorWorkspaceToolbarActions'
import type { LobbyConnectionStatus } from '@/types/session/lobby'

type EditorWorkspaceToolbarProps = {
  themeMode: 'light' | 'dark'
  dataUiState?: string
  launchLabel?: string
  isCreatingCampaign: boolean
  isJoiningCampaign: boolean
  connectionStatus: LobbyConnectionStatus
  onCreateCampaign: () => void
  onJoinCampaign: () => void
  onToggleTheme: () => void
  onOpenUserSettings: () => void
  onReturnToLobby: () => void
  onLaunch?: () => void
  isLaunchDisabled?: boolean
  launchDisabledReason?: string
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

  const centerContent = props.onLaunch ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <button
            type="button"
            className="session-toolbar__action session-toolbar__action--launch"
            onClick={props.onLaunch}
            disabled={props.isLaunchDisabled}
          >
            <Icon name="rocket_launch" />
            <span>{props.launchLabel || 'Campaign'}</span>
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="center">
        {`Launch: ${props.launchLabel || 'campaign'}`}
      </TooltipContent>
    </Tooltip>
  ) : undefined

  return (
    <WorkspaceToolbar
      className="session-toolbar--lobby"
      dataTestId="session-lobby-toolbar"
      dataUiComponent="EditorWorkspaceToolbar"
      dataUiState={props.dataUiState}
      brandAriaLabel="Editor toolbar"
      centerContent={centerContent}
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
