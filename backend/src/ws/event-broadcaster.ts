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
   * Broadcast an event to all connected members of a campaign (lobby-level events).
   * Use for events that are not session-scoped (e.g. CAMPAIGN:JOIN_REQUEST_RECEIVED).
   */
  async broadcastToCampaignMembers(campaignId: UUID, event: EventEnvelope): Promise<void> {
    if (!this.wsManager) {
      throw new Error('WebSocketManager not initialized in broadcaster')
    }
    await this.wsManager.broadcastToCampaignMembers(campaignId, event)
  }

  /**
   * Send an event to a single connected user across all their active connections.
   * Use for targeted notifications (e.g. CAMPAIGN:JOIN_REQUEST_RESOLVED to requester).
   */
  sendToUser(userId: UUID, event: EventEnvelope): void {
    if (!this.wsManager) {
      throw new Error('WebSocketManager not initialized in broadcaster')
    }
    const OPEN_STATE = 1
    const wss = (this.wsManager as any).wss
    if (!wss) return
    wss.clients.forEach((client: any) => {
      if (client.readyState === OPEN_STATE && client.authPayload?.userId === userId) {
        client.send(JSON.stringify({ type: 'WS:EVENT', event }))
      }
    })
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
