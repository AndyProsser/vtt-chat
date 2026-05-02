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

import type { ConnectionState } from '@/types/ws'
import '../../styles/components/ui/ReconnectBanner.css'

export interface ReconnectBannerProps {
  /** Current WebSocket connection state. */
  wsState: ConnectionState
  /** When true, a reconnect was just completed and the store is being re-hydrated. */
  isHydrating?: boolean
}

export function ReconnectBanner({ wsState, isHydrating }: ReconnectBannerProps) {
  if (wsState === 'connected' && !isHydrating) return null

  let message: string
  if (isHydrating) {
    message = 'Reconnected — refreshing session data…'
  } else if (wsState === 'reconnecting' || wsState === 'connecting') {
    message = 'Reconnecting to session…'
  } else if (wsState === 'disconnected') {
    message = 'Connection lost. Attempting to reconnect…'
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
      className="vtt-reconnect-banner"
    >
      {message}
    </div>
  )
}
