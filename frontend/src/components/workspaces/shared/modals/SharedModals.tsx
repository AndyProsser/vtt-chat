import type { ModalsProps } from '@/types/modals'
import { UserSettingsModal } from './UserSettingsModal'

type SharedModalsProps = Pick<
  ModalsProps,
  | 'showUserSettingsModal'
  | 'onUserSettingsOpenChange'
  | 'messageGroupingWindowMs'
  | 'onMessageGroupingWindowChange'
  | 'apiUrl'
  | 'token'
  | 'user'
>

export function SharedModals(props: SharedModalsProps) {
  return (
    <UserSettingsModal
      showUserSettingsModal={props.showUserSettingsModal}
      onUserSettingsOpenChange={props.onUserSettingsOpenChange}
      messageGroupingWindowMs={props.messageGroupingWindowMs}
      onMessageGroupingWindowChange={props.onMessageGroupingWindowChange}
      apiUrl={props.apiUrl}
      token={props.token}
      user={props.user}
    />
  )
}
