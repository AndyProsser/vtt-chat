/**
 * Toast Component
 * Non-blocking, persona-safe error/info/warn/success toasts.
 * Uses CSS custom properties from theme.css for dark/light token parity.
 * Animation via `toast-slide-in` keyframe defined in theme.css.
 */

export type ToastVariant = 'info' | 'warn' | 'error' | 'success'

export interface ToastProps {
  /** Display message — must already be persona-safe (no raw error stack traces). */
  message: string
  variant: ToastVariant
  onDismiss?: () => void
}

/**
 * Maps each variant to the CSS custom-property token names so the component
 * is completely theme-agnostic; actual colour values live in theme.css.
 */
const VARIANT_TOKEN_MAP: Record<ToastVariant, { surface: string; border: string; text: string }> = {
  info: {
    surface: 'var(--color-info-surface)',
    border: 'var(--color-info)',
    text: 'var(--color-info-text)',
  },
  warn: {
    surface: 'var(--color-warn-surface)',
    border: 'var(--color-warn)',
    text: 'var(--color-warn-text)',
  },
  error: {
    surface: 'var(--color-error-surface)',
    border: 'var(--color-error)',
    text: 'var(--color-error-text)',
  },
  success: {
    surface: 'var(--color-success-surface)',
    border: 'var(--color-success)',
    text: 'var(--color-success-text)',
  },
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

export function Toast({ message, variant, onDismiss }: ToastProps) {
  const tokens = VARIANT_TOKEN_MAP[variant]
  const ariaLive = ARIA_LIVE_MAP[variant]

  return (
    <div
      role={ariaLive === 'assertive' ? 'alert' : 'status'}
      aria-live={ariaLive}
      aria-atomic="true"
      data-variant={variant}
      className={`vtt-toast vtt-toast--${variant}`}
      style={{
        padding: 'var(--space-3) var(--space-3)',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${tokens.border}`,
        backgroundColor: tokens.surface,
        color: tokens.text,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        alignItems: 'center',
        fontSize: '0.82rem',
        animation: 'toast-slide-in var(--duration-normal) var(--ease-out)',
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          style={{
            border: 'none',
            background: 'transparent',
            color: tokens.text,
            cursor: 'pointer',
            fontWeight: 700,
            padding: 0,
            fontSize: '1rem',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
