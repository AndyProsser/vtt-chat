import { memo } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ModalsProps } from '@/types/modals'

type ReissueInviteModalProps = Pick<
  ModalsProps,
  | 'showReissueInviteModal'
  | 'onCloseReissueInviteModal'
  | 'reissueInviteType'
  | 'isInviteReissuing'
  | 'onConfirmReissueInvite'
>

export const ReissueInviteModal = memo(function ReissueInviteModal(props: ReissueInviteModalProps) {
  return (
    <DialogPrimitive.Root
      open={props.showReissueInviteModal}
      onOpenChange={(open) => {
        if (!open) {
          props.onCloseReissueInviteModal()
        }
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="session-modal-backdrop session-modal-backdrop--overlay" />
        <DialogPrimitive.Content className="session-modal session-modal--confirm-dialog session-modal--floating">
          <DialogPrimitive.Title className="session-inline-form-title">
            Refresh {props.reissueInviteType === 'SPECTATOR' ? 'Watch' : 'Join'} Link
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="session-card-subtitle">
            Refresh this invite? Existing links will stop working for new joins.
          </DialogPrimitive.Description>
          <div className="session-action-row session-action-row--confirm-dialog">
            <button
              type="button"
              className="session-button session-button-neutral"
              onClick={props.onCloseReissueInviteModal}
              disabled={props.isInviteReissuing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="session-button session-button-warn"
              onClick={props.onConfirmReissueInvite}
              disabled={props.isInviteReissuing || !props.reissueInviteType}
            >
              {props.isInviteReissuing ? 'Refreshing...' : 'Refresh Link'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
})
