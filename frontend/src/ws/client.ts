/**
 * WebSocket Client
 * Manages connection lifecycle, event transport, and state recovery.
 * Reference: docs/architecture/EVENT-BUS.md
 */

import type { EventEnvelope, UUID } from '@shared'
import { isValidUUID } from '@shared'
import { logger } from '../utils/logger'

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

type IncomingWsMessage =
  | EventEnvelope
  | {
      type: 'WS:EVENT'
      event: EventEnvelope
    }
  | {
      type: 'WS:CONNECTED'
      connectionId: string
      userId: string
      username: string
      role: string
    }
  | {
      type: 'WS:ACK'
      eventId: string
      status: string
    }
  | {
      type: 'WS:ERROR'
      code: string
      message: string
    }

/**
 * WebSocket client for event-based communication.
 * Handles connection, authentication, event transport, and automatic reconnection.
 */
export class WebSocketClient {
  private socket: WebSocket | null = null
  private state: ConnectionState = 'disconnected'
  private token: string
  private url: string

  // Reconnection state
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelayMs = 1000
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null

  // Event queue for offline handling
  private eventQueue: EventEnvelope[] = []

  // Callbacks
  private callbacks: {
    onStateChange?: (state: ConnectionState) => void
    onEvent?: (event: EventEnvelope) => void
    onError?: (error: Error) => void
  }

  constructor(options: ConnectionOptions) {
    this.url = options.url
    this.token = options.token
    this.callbacks = {
      onStateChange: options.onStateChange,
      onEvent: options.onEvent,
      onError: options.onError,
    }

    if (options.maxReconnectAttempts !== undefined) {
      this.maxReconnectAttempts = options.maxReconnectAttempts
    }
    if (options.reconnectDelayMs !== undefined) {
      this.reconnectDelayMs = options.reconnectDelayMs
    }
  }

  /**
   * Establish WebSocket connection.
   */
  async connect(): Promise<void> {
    if (this.state !== 'disconnected' && this.state !== 'reconnecting') {
      logger.warn('ws.client', `Cannot connect: already in state ${this.state}`)
      return
    }

    this.setState('connecting')

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url)

        this.socket.onopen = () => {
          this.socket?.send(
            JSON.stringify({
              type: 'WS:AUTH',
              token: this.token,
            })
          )
          this.reconnectAttempts = 0
          this.setState('connected')
          this.flushEventQueue()
          resolve()
        }

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.socket.onerror = (error) => {
          const err = new Error(`WebSocket error: ${error}`)
          this.callbacks.onError?.(err)
          reject(err)
        }

        this.socket.onclose = () => {
          this.setState('disconnected')
          this.scheduleReconnect()
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        this.callbacks.onError?.(err)
        reject(err)
      }
    })
  }

  /**
   * Disconnect from server.
   */
  disconnect(): void {
    this.clearReconnectTimeout()

    if (this.socket) {
      this.socket.close()
      this.socket = null
    }

    this.setState('disconnected')
  }

  /**
   * Send an event to the server.
   * Events are queued if disconnected; they will be sent on reconnect.
   */
  send(event: EventEnvelope): void {
    if (!isValidUUID(event.id)) {
      const error = new Error(`Invalid event ID: ${event.id}`)
      this.callbacks.onError?.(error)
      return
    }

    if (this.state === 'connected' && this.socket) {
      try {
        this.socket.send(JSON.stringify(event))
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        logger.error('ws.client', 'Failed to send event', err)
        this.callbacks.onError?.(err)
        // Queue for retry
        this.eventQueue.push(event)
      }
    } else {
      // Queue if not connected
      this.eventQueue.push(event)
    }
  }

  /**
   * Get current connection state.
   */
  getState(): ConnectionState {
    return this.state
  }

  /**
   * Get queued events (for debugging).
   */
  getQueuedEvents(): EventEnvelope[] {
    return [...this.eventQueue]
  }

  /**
   * Clear queued events.
   */
  clearQueue(): void {
    this.eventQueue = []
  }

  // Private methods

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState
      this.callbacks.onStateChange?.(newState)
    }
  }

  private handleMessage(data: string): void {
    try {
      const incoming = JSON.parse(data) as IncomingWsMessage

      if ((incoming as any).type === 'WS:EVENT' && (incoming as any).event) {
        this.callbacks.onEvent?.((incoming as any).event)
        return
      }

      if ((incoming as any).type === 'WS:CONNECTED') {
        const msg = incoming as {
          type: 'WS:CONNECTED'
          connectionId: string
          userId: string
          username: string
          role: string
        }
        if (!isValidUUID(msg.userId)) {
          this.callbacks.onError?.(new Error(`Invalid WS:CONNECTED userId: ${msg.userId}`))
          return
        }

        const normalized: EventEnvelope = {
          id: crypto.randomUUID() as UUID,
          type: 'WS:CONNECTED',
          version: 1,
          userId: msg.userId,
          userRole: msg.role as any,
          sessionId: '00000000-0000-4000-8000-000000000000' as UUID,
          roomId: null,
          timestamp: Date.now(),
          payload: {
            userId: msg.userId,
            username: msg.username,
            userRole: msg.role,
            connectionId: msg.connectionId,
          },
        }
        this.callbacks.onEvent?.(normalized)
        return
      }

      if ((incoming as any).type === 'WS:ACK') {
        return
      }

      if ((incoming as any).type === 'WS:ERROR') {
        const msg = incoming as { type: 'WS:ERROR'; message: string }
        this.callbacks.onError?.(new Error(msg.message || 'WebSocket server error'))
        return
      }

      // Backward compatibility: raw event envelope payload
      this.callbacks.onEvent?.(incoming as EventEnvelope)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      logger.error('ws.client', 'Failed to parse message', err)
      this.callbacks.onError?.(err)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('ws.client', `Max reconnection attempts (${this.maxReconnectAttempts}) reached`)
      return
    }

    this.reconnectAttempts += 1
    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1)

    logger.info(
      'ws.client',
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    )

    this.setState('reconnecting')
    this.reconnectTimeoutId = setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('ws.client', 'Reconnection failed', error)
      })
    }, delay)
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId)
      this.reconnectTimeoutId = null
    }
  }

  private flushEventQueue(): void {
    while (this.eventQueue.length > 0 && this.state === 'connected' && this.socket) {
      const event = this.eventQueue.shift()
      if (event) {
        try {
          this.socket.send(JSON.stringify(event))
        } catch {
          // Put it back and give up
          this.eventQueue.unshift(event)
          break
        }
      }
    }
  }
}
