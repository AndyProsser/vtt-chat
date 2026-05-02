/**
 * ReconnectBanner Component
 * Atomic reconnect/hydration UX.
 *
 * Shown as a top-of-surface banner whenever the WebSocket is in a
 * non-connected state. Hides automatically once the connection is restored
 * and hydration completes.
 *
 * Uses CSS custom properties from theme.css.
 */

import type { ConnectionState } from '../../ws/client'

export interface ReconnectBannerProps {
  /** Current WebSocket connection state. */
  wsState: ConnectionState
  /** When true, a reconnect was just completed and the store is being re-hydrated. */
  isHydrating?: boolean
}

export function ReconnectBanner({ wsState, isHydrating }: ReconnectBannerProps) {
  if (wsState === 'connected' && !isHydrating) return null

  const isReconnecting = wsState === 'reconnecting'
  const isConnecting = wsState === 'connecting'
  const isDisconnected = wsState === 'disconnected'

  let message: string
  let surface: string
  let borderColor: string
  let textColor: string

  if (isHydrating) {
    message = 'Reconnected — refreshing session data…'
    surface = 'var(--color-info-surface)'
    borderColor = 'var(--color-info)'
    textColor = 'var(--color-info-text)'
  } else if (isReconnecting || isConnecting) {
    message = 'Reconnecting to session…'
    surface = 'var(--color-warn-surface)'
    borderColor = 'var(--color-warn)'
    textColor = 'var(--color-warn-text)'
  } else if (isDisconnected) {
    message = 'Connection lost. Attempting to reconnect…'
    surface = 'var(--color-error-surface)'
    borderColor = 'var(--color-error)'
    textColor = 'var(--color-error-text)'
  } else {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="reconnect-banner"
      data-ws-state={wsState}
      data-hydrating={isHydrating ? 'true' : 'false'}
      style={{
        padding: 'var(--space-2) var(--space-4)',
        backgroundColor: surface,
        color: textColor,
        borderTop: `2px solid ${borderColor}`,
        borderBottom: `2px solid ${borderColor}`,
        fontSize: '0.82rem',
        fontWeight: 500,
        textAlign: 'center',
        animation: 'toast-slide-in var(--duration-fast) var(--ease-out)',
      }}
    >
      {message}
    </div>
  )
}
