import { useEffect, useRef } from 'react'
import type { ToastVariant } from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'

export interface SystemToastsProps {
  toastId?: string
  message?: string
  /** Toast severity. Defaults to "info". */
  variant?: ToastVariant
  onDismiss?: () => void
}

export function SystemToasts({ toastId, message, variant = 'info', onDismiss }: SystemToastsProps) {
  const showToast = useToast()
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!message) {
      return
    }

    showToast({
      id: toastId,
      message,
      variant,
      onDismiss: () => {
        onDismissRef.current?.()
      },
    })
  }, [message, showToast, toastId, variant])

  return null
}
