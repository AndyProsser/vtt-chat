import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { WorkspaceToolbar } from '@/components/workspaces/shared/toolbar/WorkspaceToolbar'
import { useCampaignWorkspaceToolbarActions } from '@/hooks/workspaces/useCampaignWorkspaceToolbarActions'
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
  const [showLogoffDialog, setShowLogoffDialog] = useState(false)
  const { coreStateToneClass, toolbarActions } = useCampaignWorkspaceToolbarActions({
    isCreatingCampaign: props.isCreatingCampaign,
    isJoiningCampaign: props.isJoiningCampaign,
    onCreateCampaign: props.onCreateCampaign,
    onJoinCampaign: props.onJoinCampaign,
    coreWsState: props.connectionStatus.coreWsState,
  })

  const handleConfirmLogout = () => {
    setShowLogoffDialog(false)
    props.onLogoff()
  }

  return (
    <>
      <WorkspaceToolbar
        className="session-toolbar--lobby"
        dataTestId="workspaces-lobby-toolbar"
        dataUiComponent="LobbyToolbar"
        brandAriaLabel="Lobby toolbar"
        extraActions={toolbarActions}
        themeMode={props.themeMode}
        onToggleTheme={props.onToggleTheme}
        onOpenUserSettings={props.onOpenUserSettings}
        onExit={() => setShowLogoffDialog(true)}
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

      <DialogPrimitive.Root open={showLogoffDialog} onOpenChange={setShowLogoffDialog}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="session-modal-backdrop session-modal-backdrop--overlay"
            style={{ zIndex: 1400 }}
          />
          <DialogPrimitive.Content
            className="session-modal session-modal--confirm-dialog"
            style={{
              zIndex: 1401,
              position: 'fixed',
              top: '70px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '440px',
            }}
          >
            <DialogPrimitive.Title className="session-inline-form-title">
              Log Off
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="session-card-subtitle">
              Log out of VTT Chat?
            </DialogPrimitive.Description>
            <div className="session-action-row session-action-row--confirm-dialog">
              <button
                type="button"
                className="session-button session-button-neutral"
                onClick={() => setShowLogoffDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="session-button session-button-primary"
                onClick={handleConfirmLogout}
              >
                OK
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  )
}
