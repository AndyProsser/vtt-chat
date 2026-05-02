import type { EventEnvelope } from '@shared'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface ConnectionOptions {
  /** Backend WebSocket URL (e.g., ws://localhost:3000) */
  url: string
  /** JWT token for authentication */
  token: string
  /** Callback when connection state changes */
  onStateChange?: (state: ConnectionState) => void
  /** Callback when an event is received */
  onEvent?: (event: EventEnvelope) => void
  /** Callback when connection error occurs */
  onError?: (error: Error) => void
  /** Max reconnection attempts before giving up */
  maxReconnectAttempts?: number
  /** Initial reconnection delay in ms */
  reconnectDelayMs?: number
  /** Heartbeat interval in ms */
  heartbeatIntervalMs?: number
}

export type EventHandler = (event: EventEnvelope) => void
