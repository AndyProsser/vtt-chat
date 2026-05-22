import type { ComponentProps } from 'react'
import { SessionModals } from '@/components/workspaces/session/modals/SessionModals'

type BuildSessionModalsPropsParams = {
  showExitSessionModal: boolean
  leaveSessionWarning: string | null
  user: ComponentProps<typeof SessionModals>['user']
  exitUpgradePassword: string
  onExitUpgradePasswordChange: ComponentProps<typeof SessionModals>['onExitUpgradePasswordChange']
  exitUpgradeLoading: boolean
  exitUpgradeError: string | null
  onCloseExitSession: ComponentProps<typeof SessionModals>['onCloseExitSession']
  onSkipGuestUpgrade: ComponentProps<typeof SessionModals>['onSkipGuestUpgrade']
  onUpgradeAndExit: ComponentProps<typeof SessionModals>['onUpgradeAndExit']
  onConfirmExitAsFullAccount: ComponentProps<typeof SessionModals>['onConfirmExitAsFullAccount']
  showStopSessionModal: boolean
  onCloseStopSession: ComponentProps<typeof SessionModals>['onCloseStopSession']
  onConfirmStopSession: ComponentProps<typeof SessionModals>['onConfirmStopSession']
}

export function buildSessionModalsProps(
  params: BuildSessionModalsPropsParams
): ComponentProps<typeof SessionModals> {
  return {
    showExitSessionModal: params.showExitSessionModal,
    leaveSessionWarning: params.leaveSessionWarning,
    user: params.user,
    exitUpgradePassword: params.exitUpgradePassword,
    onExitUpgradePasswordChange: params.onExitUpgradePasswordChange,
    exitUpgradeLoading: params.exitUpgradeLoading,
    exitUpgradeError: params.exitUpgradeError,
    onCloseExitSession: params.onCloseExitSession,
    onSkipGuestUpgrade: params.onSkipGuestUpgrade,
    onUpgradeAndExit: params.onUpgradeAndExit,
    onConfirmExitAsFullAccount: params.onConfirmExitAsFullAccount,
    showStopSessionModal: params.showStopSessionModal,
    onCloseStopSession: params.onCloseStopSession,
    onConfirmStopSession: params.onConfirmStopSession,
  }
}
