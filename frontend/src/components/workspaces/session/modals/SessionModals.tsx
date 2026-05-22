import { ExitSessionModal, StopSessionModal } from '@/components/workspaces/shared/modals'
import type { ModalsProps } from '@/types/modals'

type SessionModalsProps = Pick<
  ModalsProps,
  | 'showExitSessionModal'
  | 'user'
  | 'exitUpgradePassword'
  | 'onExitUpgradePasswordChange'
  | 'exitUpgradeLoading'
  | 'exitUpgradeError'
  | 'onCloseExitSession'
  | 'onSkipGuestUpgrade'
  | 'onUpgradeAndExit'
  | 'onConfirmExitAsFullAccount'
  | 'showStopSessionModal'
  | 'onCloseStopSession'
  | 'onConfirmStopSession'
> & {
  leaveSessionWarning: string | null
}

export function SessionModals(props: SessionModalsProps) {
  return (
    <>
      <ExitSessionModal
        showExitSessionModal={props.showExitSessionModal}
        leaveSessionWarning={props.leaveSessionWarning}
        user={props.user}
        exitUpgradePassword={props.exitUpgradePassword}
        onExitUpgradePasswordChange={props.onExitUpgradePasswordChange}
        exitUpgradeLoading={props.exitUpgradeLoading}
        exitUpgradeError={props.exitUpgradeError}
        onCloseExitSession={props.onCloseExitSession}
        onSkipGuestUpgrade={props.onSkipGuestUpgrade}
        onUpgradeAndExit={props.onUpgradeAndExit}
        onConfirmExitAsFullAccount={props.onConfirmExitAsFullAccount}
      />

      <StopSessionModal
        showStopSessionModal={props.showStopSessionModal}
        onCloseStopSession={props.onCloseStopSession}
        onConfirmStopSession={props.onConfirmStopSession}
      />
    </>
  )
}
