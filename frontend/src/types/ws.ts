import type { DeviceClass, EventEnvelope, UUID } from '@shared'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export interface ConnectionOptions {
  /** Backend WebSocket URL (e.g., ws://localhost:3000) */
  url: string
  /** JWT token for authentication */
  token: string
  /** Active session to bind the socket to for session-scoped broadcasts */
  sessionId?: UUID | null
  /** Stable per-device-session identifier for multi-device negotiation */
  deviceSessionId?: string
  /** Client inferred device class used for transport negotiation and UI labels */
  deviceClass?: DeviceClass
  /** Callback when connection state changes */
  onStateChange?: (state: ConnectionState) => void
  /** Callback when an event is received */
  onEvent?: (event: EventEnvelope) => void
  /** Callback when connection error occurs */
  onError?: (error: Error) => void
  /** Callback when the backend rejects auth for this socket/token */
  onAuthFailure?: (reason: string) => void
  /** Max reconnection attempts before giving up */
  maxReconnectAttempts?: number
  /** Initial reconnection delay in ms */
  reconnectDelayMs?: number
  /** Heartbeat interval in ms */
  heartbeatIntervalMs?: number
}

export type EventHandler = (event: EventEnvelope) => void
