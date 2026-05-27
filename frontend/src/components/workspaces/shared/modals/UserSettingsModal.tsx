import * as DialogPrimitive from '@radix-ui/react-dialog'
import { UserSettingsPanel } from '@/components/workspaces/shared/panels/UserSettingsPanel'
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
  return (
    <DialogPrimitive.Root
      open={props.showUserSettingsModal}
      onOpenChange={props.onUserSettingsOpenChange}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay session-user-settings-backdrop" />
        <DialogPrimitive.Content className="session-modal session-user-settings-modal session-modal--floating">
          <DialogPrimitive.Title className="session-inline-form-title">
            User Settings
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Configure your user preferences.
          </DialogPrimitive.Description>
          <UserSettingsPanel
            messageGroupingWindowMs={props.messageGroupingWindowMs}
            onMessageGroupingWindowChange={props.onMessageGroupingWindowChange}
            apiUrl={props.apiUrl}
            token={props.token}
            userId={props.user.id}
            username={props.user.username}
          />
          <div className="session-action-row">
            <DialogPrimitive.Close asChild>
              <button type="button" className="session-button session-button-neutral">
                Close
              </button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
