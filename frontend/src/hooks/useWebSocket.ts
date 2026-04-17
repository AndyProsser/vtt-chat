/**
 * useWebSocket Hook
 * Manages WebSocket connection lifecycle and event dispatching.
 * Integrates with Zustand store through event handlers.
 */

import { useEffect, useRef, useState } from 'react'
import type { EventEnvelope } from '@shared'
import { WebSocketClient, type ConnectionState } from '../ws/client'
import { EventDispatcher } from '../ws/dispatcher'
import { useStore } from './useStore'

export interface UseWebSocketOptions {
  url: string
  token: string
  enabled?: boolean
}

export interface UseWebSocketReturn {
  state: ConnectionState
  send: (event: EventEnvelope) => void
  isConnected: boolean
  error: Error | null
}

/**
 * Hook for managing WebSocket connection and event dispatching.
 * Automatically connects/disconnects based on token availability.
 * Registers event handlers with the store.
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { url, token, enabled = true } = options

  const [state, setState] = useState<ConnectionState>('disconnected')
  const [error, setError] = useState<Error | null>(null)

  const clientRef = useRef<WebSocketClient | null>(null)
  const dispatcherRef = useRef<EventDispatcher | null>(null)

  // Get store actions
  const store = useStore()

  // Initialize WebSocket client and dispatcher
  useEffect(() => {
    if (!enabled || !token) {
      return
    }

    // Create client and dispatcher
    const client = new WebSocketClient({
      url,
      token,
      onStateChange: setState,
      onError: setError,
      onEvent: (event) => {
        if (dispatcherRef.current) {
          dispatcherRef.current.dispatch(event)
        }
      },
    })

    const dispatcher = new EventDispatcher()

    // Register handlers for each event type
    // Session events
    dispatcher.register('SESSION:CREATED', (event) => {
      store.handleSessionCreated(event)
    })
    dispatcher.register('SESSION:STATE_CHANGED', (event) => {
      store.handleSessionStateChanged(event)
    })
    dispatcher.register('SESSION:ENDED', (event) => {
      store.handleSessionEnded(event)
    })

    // Chat events
    dispatcher.register('CHAT:MESSAGE_SENT', (event) => {
      store.handleMessageSent(event)
    })
    dispatcher.register('CHAT:MESSAGE_EDITED', (event) => {
      store.handleMessageEdited(event)
    })
    dispatcher.register('CHAT:MESSAGE_DELETED', (event) => {
      store.handleMessageDeleted(event)
    })
    dispatcher.register('CHAT:TYPING_STARTED', (event) => {
      store.handleTypingStarted(event)
    })
    dispatcher.register('CHAT:TYPING_STOPPED', (event) => {
      store.handleTypingStopped(event)
    })

    // Notes events
    dispatcher.register('NOTES:CREATED', (event) => {
      store.handleNoteCreated(event)
    })
    dispatcher.register('NOTES:UPDATED', (event) => {
      store.handleNoteUpdated(event)
    })
    dispatcher.register('NOTES:DELETED', (event) => {
      store.handleNoteDeleted(event)
    })

    // Room events
    dispatcher.register('ROOM:CREATED', (event) => {
      store.handleRoomCreated(event)
    })
    dispatcher.register('ROOM:USER_JOINED', (event) => {
      store.handleUserJoined(event)
    })
    dispatcher.register('ROOM:USER_LEFT', (event) => {
      store.handleUserLeft(event)
    })

    // Presence events
    dispatcher.register('PRESENCE:STATE_CHANGED', (event) => {
      store.handlePresenceStateChanged(event)
    })

    // Audio events
    dispatcher.register('AUDIO:EFFECT_APPLIED', (event) => {
      store.handleEffectApplied(event)
    })
    dispatcher.register('AUDIO:ENVIRONMENT_SET', (event) => {
      store.handleEnvironmentSet(event)
    })
    dispatcher.register('AUDIO:DM_OVERRIDE_APPLIED', (event) => {
      store.handleDmOverrideApplied(event)
    })

    // Metadata events (WS internal)
    dispatcher.register('WS:CONNECTED', (event) => {
      store.handleConnectionEstablished(event)
    })

    clientRef.current = client
    dispatcherRef.current = dispatcher

    // Connect
    client.connect().catch((err) => {
      console.error('Failed to connect:', err)
      setError(err)
    })

    // Cleanup
    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
      dispatcherRef.current = null
    }
  }, [enabled, token, url, store])

  const send = (event: EventEnvelope) => {
    if (clientRef.current) {
      clientRef.current.send(event)
    }
  }

  return {
    state,
    send,
    isConnected: state === 'connected',
    error,
  }
}
