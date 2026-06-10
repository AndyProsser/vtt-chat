import { memo, useMemo } from 'react'
import { WorkspaceToolbar } from '@/components/workspaces/shared/toolbar/WorkspaceToolbar'
import { InvitePopoverWidget } from '@/components/workspaces/shared/toolbar/InvitePopoverWidget'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import type { LobbyConnectionStatus } from '@/types/session/lobby'

type EditorWorkspaceToolbarProps = {
  themeMode: 'light' | 'dark'
  dataUiState?: string
  launchLabel?: string
  connectionStatus: LobbyConnectionStatus
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

export const EditorWorkspaceToolbar = memo(function EditorWorkspaceToolbar({
  themeMode,
  connectionStatus,
  onToggleTheme,
  onOpenUserSettings,
  onReturnToLobby,
  onLaunch,
  isLaunchDisabled,
  launchLabel,
  showInviteWidget,
  joinUrl,
  spectatorsEnabled,
  watchUrl,
  canRefreshInvites,
  onCopyInviteUrl,
  onReissueInvite,
  isInviteReissuing,
}: EditorWorkspaceToolbarProps) {
  const coreStateToneClass =
    connectionStatus.coreWsState === 'CONNECTED'
      ? 'is-green'
      : connectionStatus.coreWsState === 'CONNECTING'
        ? 'is-yellow'
        : 'is-red'

  // Memoised so WorkspaceToolbar's memo check passes when launch data is unchanged.
  const centerContent = useMemo(
    () =>
      onLaunch ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <button
                type="button"
                className="session-toolbar__action session-toolbar__action--launch"
                onClick={onLaunch}
                disabled={isLaunchDisabled}
              >
                <Icon name="rocket_launch" />
                <span>{launchLabel || 'Campaign'}</span>
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            {`Launch: ${launchLabel || 'campaign'}`}
          </TooltipContent>
        </Tooltip>
      ) : undefined,
    [isLaunchDisabled, launchLabel, onLaunch]
  )

  // Memoised so WorkspaceToolbar's memo check passes when invite data is unchanged.
  const extraActions = useMemo(
    () =>
      showInviteWidget ? (
        <InvitePopoverWidget
          show={showInviteWidget}
          joinUrl={joinUrl}
          spectatorsEnabled={spectatorsEnabled}
          watchUrl={watchUrl}
          canRefreshInvites={canRefreshInvites}
          onCopyInviteUrl={onCopyInviteUrl}
          onReissueInvite={onReissueInvite}
          isInviteReissuing={isInviteReissuing}
        />
      ) : undefined,
    [
      canRefreshInvites,
      isInviteReissuing,
      joinUrl,
      onCopyInviteUrl,
      onReissueInvite,
      showInviteWidget,
      spectatorsEnabled,
      watchUrl,
    ]
  )

  return (
    <WorkspaceToolbar
      className="session-toolbar--lobby"
      dataTestId="workspaces-lobby-toolbar"
      dataUiComponent="EditorWorkspaceToolbar"
      brandAriaLabel="Editor toolbar"
      centerContent={centerContent}
      extraActions={extraActions}
      themeMode={themeMode}
      onToggleTheme={onToggleTheme}
      onOpenUserSettings={onOpenUserSettings}
      onExit={onReturnToLobby}
      exitIcon="arrow_back"
      exitAriaLabel="Return to lobby"
      exitTooltipLabel="Return"
      connectionStatusColorKey={connectionStatus.statusColorKey}
      connectionStatusLabel={connectionStatus.label}
      connectionStatusRows={[
        {
          label: 'Core',
          value: connectionStatus.coreWsState,
          toneClassName: coreStateToneClass,
        },
      ]}
    />
  )
})
