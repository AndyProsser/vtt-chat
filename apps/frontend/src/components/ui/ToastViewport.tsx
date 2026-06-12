import { useEffect, useState } from 'react'
import { Toast } from './Toast'
import {
  dismissToast,
  getToastItems,
  subscribeToasts,
  type ToastCenterItem,
} from '@/state/toastCenter'

export function ToastViewport() {
  const [items, setItems] = useState<ToastCenterItem[]>(() => getToastItems())

  useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) {
    return null
  }

  return (
    <div className="vtt-toast-viewport" data-testid="toast-viewport" aria-label="Notifications">
      {items.map((item) => (
        <Toast
          key={item.id}
          variant={item.variant}
          message={item.message}
          actionLabel={item.actionLabel}
          onAction={item.onAction}
          onDismiss={() => dismissToast(item.id)}
        />
      ))}
    </div>
  )
}
