import { useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  UserSettingsPanel,
  type UserSettingsPanelHandle,
} from '@/components/workspaces/shared/panels/UserSettingsPanel'
import type { ModalsProps } from '@/types/modals'

type UserSettingsModalProps = Pick<
  ModalsProps,
  | 'showUserSettingsModal'
  | 'onUserSettingsOpenChange'
  | 'messageGroupingWindowMs'
  | 'onMessageGroupingWindowChange'
  | 'apiUrl'
  | 'token'
  | 'user'
>

export function UserSettingsModal(props: UserSettingsModalProps) {
  const panelRef = useRef<UserSettingsPanelHandle | null>(null)

  return (
    <DialogPrimitive.Root
      open={props.showUserSettingsModal}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          props.onUserSettingsOpenChange(true)
          return
        }

        void (async () => {
          await panelRef.current?.flushPendingChanges()
          props.onUserSettingsOpenChange(false)
        })()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay session-user-settings-backdrop" />
        <DialogPrimitive.Content className="session-modal session-user-settings-modal session-modal--floating">
          <DialogPrimitive.Title className="session-inline-form-title">
            User Settings
          </DialogPrimitive.Title>
          <UserSettingsPanel
            ref={panelRef}
            apiUrl={props.apiUrl}
            token={props.token}
            userId={props.user.id}
            username={props.user.username}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
