import type { ComponentProps } from 'react'
import { SharedModals } from '@/components/workspaces/shared/modals/SharedModals'

type BuildSharedModalsPropsParams = {
  showUserSettingsModal: boolean
  onUserSettingsOpenChange: ComponentProps<typeof SharedModals>['onUserSettingsOpenChange']
  messageGroupingWindowMs: number
  onMessageGroupingWindowChange: ComponentProps<
    typeof SharedModals
  >['onMessageGroupingWindowChange']
  apiUrl: string
  token: string
  user: ComponentProps<typeof SharedModals>['user']
}

export function buildSharedModalsProps(
  params: BuildSharedModalsPropsParams
): ComponentProps<typeof SharedModals> {
  return {
    showUserSettingsModal: params.showUserSettingsModal,
    onUserSettingsOpenChange: params.onUserSettingsOpenChange,
    messageGroupingWindowMs: params.messageGroupingWindowMs,
    onMessageGroupingWindowChange: params.onMessageGroupingWindowChange,
    apiUrl: params.apiUrl,
    token: params.token,
    user: params.user,
  }
}
