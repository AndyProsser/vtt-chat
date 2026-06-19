import { memo } from 'react'
import type { ModalsProps } from '@/types/modals'

type StopSessionModalProps = Pick<
  ModalsProps,
  'showStopSessionModal' | 'onCloseStopSession' | 'onConfirmStopSession'
>

export const StopSessionModal = memo(function StopSessionModal(props: StopSessionModalProps) {
  if (!props.showStopSessionModal) {
    return null
  }

  return (
    <div
      className="session-modal-backdrop session-modal-backdrop--top-offset"
      role="presentation"
      onClick={props.onCloseStopSession}
    >
      <div
        className="session-modal session-modal--confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="End session"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 className="session-inline-form-title">End Session</h4>
        <p className="session-card-subtitle">End this session for everyone?</p>
        <p className="session-card-subtitle">
          This ends tonight&apos;s chapter for the whole table. Final scene, then credits.
        </p>
        <div className="session-action-row session-action-row--confirm-dialog">
          <button
            type="button"
            className="session-button session-button-neutral"
            onClick={props.onCloseStopSession}
          >
            Cancel
          </button>
          <button
            type="button"
            className="session-button session-button-warn"
            onClick={props.onConfirmStopSession}
          >
            End Session
          </button>
        </div>
      </div>
    </div>
  )
})
