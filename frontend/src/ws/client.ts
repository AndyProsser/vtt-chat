/**
 * WebSocket Client
 * Manages connection lifecycle, event transport, and state recovery.
 * Reference: docs/architecture/EVENT-BUS.md
 */

import type { EventEnvelope, UUID } from '@shared'
import { Role } from '@shared'
import { isValidUUID } from '@shared'

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

  // Heartbeat state
  private heartbeatIntervalMs = 30000
  private heartbeatTimeoutId: ReturnType<typeof setInterval> | null = null
  private lastHeartbeatAckAt = Date.now()

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
    if (options.heartbeatIntervalMs !== undefined) {
      this.heartbeatIntervalMs = options.heartbeatIntervalMs
    }
  }

  /**
   * Establish WebSocket connection.
   */
  async connect(): Promise<void> {
    if (this.state !== 'disconnected' && this.state !== 'reconnecting') {
      console.warn(`Cannot connect: already in state ${this.state}`)
      return
    }

    this.setState('connecting')

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = new URL(this.url)
        wsUrl.searchParams.set('token', this.token)

        this.socket = new WebSocket(wsUrl.toString())

        this.socket.onopen = () => {
          this.reconnectAttempts = 0
          this.setState('connected')
          this.startHeartbeat()
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
          this.stopHeartbeat()
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
    this.stopHeartbeat()
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
        console.error('Failed to send event:', err)
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
      const event = JSON.parse(data) as EventEnvelope

      // Handle internal events
      if (event.type === 'WS:HEARTBEAT_ACK') {
        this.lastHeartbeatAckAt = Date.now()
        return
      }

      // Dispatch to callbacks
      this.callbacks.onEvent?.(event)
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error('Failed to parse message:', err)
      this.callbacks.onError?.(err)
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatTimeoutId = setInterval(() => {
      if (this.socket && this.state === 'connected') {
        const heartbeatEvent: EventEnvelope = {
          id: this.generateId(),
          type: 'WS:HEARTBEAT',
          version: 1,
          userId: this.generateId(),
          userRole: Role.SYSTEM,
          sessionId: this.generateId(),
          roomId: null,
          timestamp: Date.now(),
          payload: {},
        }

        try {
          this.socket.send(JSON.stringify(heartbeatEvent))
        } catch (error) {
          console.warn('Heartbeat send failed, reconnecting...')
          this.disconnect()
        }

        // Check if we got ack within the interval
        if (Date.now() - this.lastHeartbeatAckAt > this.heartbeatIntervalMs * 2) {
          console.warn('No heartbeat ack, reconnecting...')
          this.disconnect()
        }
      }
    }, this.heartbeatIntervalMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimeoutId) {
      clearInterval(this.heartbeatTimeoutId)
      this.heartbeatTimeoutId = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`)
      return
    }

    this.reconnectAttempts += 1
    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1)

    console.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    )

    this.setState('reconnecting')
    this.reconnectTimeoutId = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error)
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
        } catch (error) {
          // Put it back and give up
          this.eventQueue.unshift(event)
          break
        }
      }
    }
  }

  private generateId(): UUID {
    // Simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    }) as UUID
  }
}
