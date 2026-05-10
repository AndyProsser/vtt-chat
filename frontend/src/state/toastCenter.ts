import type { ToastVariant } from '@/types/ui'

const DEFAULT_TOAST_DURATION_MS = 10_000

export interface ToastCenterItem {
  id: string
  message: string
  variant: ToastVariant
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
}

export interface ShowToastInput {
  id?: string
  message: string
  variant?: ToastVariant
  durationMs?: number | null
  actionLabel?: string
  onAction?: () => void
  onDismiss?: () => void
}

type ToastSubscriber = (items: ToastCenterItem[]) => void

const subscribers = new Set<ToastSubscriber>()
const timeoutHandles = new Map<string, number>()
let items: ToastCenterItem[] = []

function emit(): void {
  for (const subscriber of subscribers) {
    subscriber(items)
  }
}

function clearItemTimer(id: string): void {
  const handle = timeoutHandles.get(id)
  if (handle !== undefined) {
    window.clearTimeout(handle)
    timeoutHandles.delete(id)
  }
}

export function getToastItems(): ToastCenterItem[] {
  return items
}

export function subscribeToasts(subscriber: ToastSubscriber): () => void {
  subscribers.add(subscriber)
  subscriber(items)

  return () => {
    subscribers.delete(subscriber)
  }
}

export function dismissToast(id: string): void {
  const match = items.find((item) => item.id === id)
  if (!match) {
    return
  }

  clearItemTimer(id)
  items = items.filter((item) => item.id !== id)
  emit()
  match.onDismiss?.()
}

export function showToast(input: ShowToastInput): string {
  const id = input.id || crypto.randomUUID()
  const nextItem: ToastCenterItem = {
    id,
    message: input.message,
    variant: input.variant ?? 'info',
    actionLabel: input.actionLabel,
    onAction: input.onAction,
    onDismiss: input.onDismiss,
  }

  clearItemTimer(id)
  items = [...items.filter((item) => item.id !== id), nextItem]
  emit()

  const shouldAutoDismiss =
    input.durationMs !== null && Number.isFinite(input.durationMs ?? DEFAULT_TOAST_DURATION_MS)

  if (shouldAutoDismiss) {
    const durationMs = Math.max(0, input.durationMs ?? DEFAULT_TOAST_DURATION_MS)
    const timeoutHandle = window.setTimeout(() => {
      dismissToast(id)
    }, durationMs)
    timeoutHandles.set(id, timeoutHandle)
  }

  return id
}

export function clearToasts(): void {
  for (const id of timeoutHandles.keys()) {
    clearItemTimer(id)
  }
  items = []
  emit()
}
