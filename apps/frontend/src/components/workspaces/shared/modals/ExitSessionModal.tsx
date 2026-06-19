import { memo } from 'react'
import type { ModalsProps } from '@/types/modals'

type ExitSessionModalProps = Pick<
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
> & {
  leaveSessionWarning: string | null
}

export const ExitSessionModal = memo(function ExitSessionModal(props: ExitSessionModalProps) {
  if (!props.showExitSessionModal) {
    return null
  }

  return (
    <div className="session-modal-backdrop session-modal-backdrop--top-offset" role="presentation">
      <div
        className="session-modal session-modal--confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Exit session"
      >
        <h4 className="session-inline-form-title">Leave Session</h4>
        {props.leaveSessionWarning ? (
          <p className="session-card-subtitle session-card-subtitle--warn">
            {props.leaveSessionWarning}
          </p>
        ) : null}
        {props.user.authType === 'GUEST' ? (
          <>
            <p className="session-card-subtitle">
              Add a password now to save this guest account before you leave. Or skip and sign out.
            </p>
            <p className="session-card-subtitle">
              If you skip, you will need your invite link to get back in.
            </p>

            <label className="session-label" htmlFor="exit-upgrade-password">
              Password to upgrade account
            </label>
            <input
              id="exit-upgrade-password"
              type="password"
              className="session-input"
              value={props.exitUpgradePassword}
              onChange={(event) => props.onExitUpgradePasswordChange(event.target.value)}
              autoComplete="new-password"
              disabled={props.exitUpgradeLoading}
            />

            {props.exitUpgradeError ? (
              <p className="session-card-subtitle">{props.exitUpgradeError}</p>
            ) : null}

            <div className="session-action-row session-action-row--confirm-dialog">
              <button
                type="button"
                className="session-button session-button-neutral"
                onClick={props.onCloseExitSession}
                disabled={props.exitUpgradeLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="session-button session-button-warn"
                onClick={props.onSkipGuestUpgrade}
                disabled={props.exitUpgradeLoading}
              >
                Skip
              </button>
              <button
                type="button"
                className="session-button session-button-success"
                onClick={props.onUpgradeAndExit}
                disabled={props.exitUpgradeLoading || !props.exitUpgradePassword.trim()}
              >
                {props.exitUpgradeLoading ? 'Upgrading...' : 'Upgrade and Exit'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="session-card-subtitle">Leave now and go back to campaign select?</p>
            <p className="session-card-subtitle">
              Any unsaved screen changes on this page will disappear.
            </p>
            <div className="session-action-row session-action-row--confirm-dialog">
              <button
                type="button"
                className="session-button session-button-neutral"
                onClick={props.onCloseExitSession}
              >
                Cancel
              </button>
              <button
                type="button"
                className="session-button session-button-primary"
                onClick={props.onConfirmExitAsFullAccount}
              >
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
})
