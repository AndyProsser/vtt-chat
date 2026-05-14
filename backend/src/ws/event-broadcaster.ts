/**
 * Event Broadcaster Service
 * Global service for broadcasting events to sessions via WebSocket.
 * Injected with WebSocketManager instance at startup.
 */

import type { EventEnvelope, UUID } from '@shared'
import type { WebSocketManager } from '@/ws'

class EventBroadcaster {
  private wsManager: WebSocketManager | null = null

  /**
   * Initialize broadcaster with WebSocket manager
   */
  setWebSocketManager(wsManager: WebSocketManager): void {
    this.wsManager = wsManager
  }

  /**
   * Broadcast an event to all clients in a session
   */
  broadcastToSession(sessionId: UUID, event: EventEnvelope, visibleTo?: UUID[]): void {
    if (!this.wsManager) {
      throw new Error('WebSocketManager not initialized in broadcaster')
    }
    this.wsManager.broadcastEventToSession(sessionId, event, visibleTo)
  }

  /**
   * Check if broadcaster is ready
   */
  isReady(): boolean {
    return this.wsManager !== null
  }
}

// Singleton instance
const broadcaster = new EventBroadcaster()

export default broadcaster
