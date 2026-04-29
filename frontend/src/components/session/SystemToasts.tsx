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
    return <p className="m-0 text-xs text-ui-secondary">No active system notices.</p>
  }

  return <Toast variant={variant} message={message} onDismiss={onDismiss} />
}
