import { Toast } from '../ui/Toast'
import type { ToastVariant } from '../ui/Toast'

export interface SystemToastsProps {
  message?: string
  /** Toast severity. Defaults to "info". */
  variant?: ToastVariant
  onDismiss?: () => void
}

export function SystemToasts({ message, variant = 'info', onDismiss }: SystemToastsProps) {
  if (!message) {
    return (
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
        No active system notices.
      </p>
    )
  }

  return <Toast variant={variant} message={message} onDismiss={onDismiss} />
}
