/**
 * Toast Component
 * Non-blocking, persona-safe error/info/warn/success toasts.
 * Uses CSS custom properties from theme.css for dark/light token parity.
 * Animation via `toast-slide-in` keyframe defined in theme.css.
 */

import type { ToastVariant } from '@/types/ui'
import '../../styles/components/ui/Toast.css'

export type { ToastVariant } from '@/types/ui'

export interface ToastProps {
  /** Display message — must already be persona-safe (no raw error stack traces). */
  message: string
  variant: ToastVariant
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
}

/**
 * Error and warn toasts are assertive so screen-readers interrupt immediately.
 * Info and success use polite so they don't disrupt ongoing narration.
 */
const ARIA_LIVE_MAP: Record<ToastVariant, 'assertive' | 'polite'> = {
  info: 'polite',
  success: 'polite',
  warn: 'assertive',
  error: 'assertive',
}

export function Toast({ message, variant, actionLabel, onAction, onDismiss }: ToastProps) {
  const ariaLive = ARIA_LIVE_MAP[variant]

  return (
    <div
      role={ariaLive === 'assertive' ? 'alert' : 'status'}
      aria-live={ariaLive}
      aria-atomic="true"
      data-variant={variant}
      className="vtt-toast"
    >
      <span className="vtt-toast__message">{message}</span>
      <span className="vtt-toast__actions">
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="vtt-toast__action">
            {actionLabel}
          </button>
        ) : null}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="vtt-toast__dismiss"
          >
            ×
          </button>
        )}
      </span>
    </div>
  )
}
