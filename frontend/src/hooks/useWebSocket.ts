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
import { logger } from '../utils/logger'

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
      useStore.getState().handleSessionCreated(event)
    })
    dispatcher.register('SESSION:STATE_CHANGED', (event) => {
      useStore.getState().handleSessionStateChanged(event)
    })
    dispatcher.register('SESSION:ENDED', (event) => {
      useStore.getState().handleSessionEnded(event)
    })

    // Chat events
    dispatcher.register('CHAT:MESSAGE_SENT', (event) => {
      useStore.getState().handleMessageSent(event)
    })
    dispatcher.register('CHAT:MESSAGE_EDITED', (event) => {
      useStore.getState().handleMessageEdited(event)
    })
    dispatcher.register('CHAT:MESSAGE_DELETED', (event) => {
      useStore.getState().handleMessageDeleted(event)
    })
    dispatcher.register('CHAT:ROOM_CONTEXT_CLEARED', (event) => {
      useStore.getState().handleRoomContextCleared(event)
    })
    dispatcher.register('CHAT:TYPING_STARTED', (event) => {
      useStore.getState().handleTypingStarted(event)
    })
    dispatcher.register('CHAT:TYPING_STOPPED', (event) => {
      useStore.getState().handleTypingStopped(event)
    })

    // Notes events
    dispatcher.register('NOTES:CREATED', (event) => {
      useStore.getState().handleNoteCreated(event)
    })
    dispatcher.register('NOTES:UPDATED', (event) => {
      useStore.getState().handleNoteUpdated(event)
    })
    dispatcher.register('NOTES:DELETED', (event) => {
      useStore.getState().handleNoteDeleted(event)
    })

    // Room events
    dispatcher.register('ROOM:CREATED', (event) => {
      useStore.getState().handleRoomCreated(event)
    })
    dispatcher.register('ROOM:USER_JOINED', (event) => {
      useStore.getState().handleUserJoined(event)
    })
    dispatcher.register('ROOM:USER_LEFT', (event) => {
      useStore.getState().handleUserLeft(event)
    })
    dispatcher.register('ROOM:SESSION_TRANSITION_APPLIED', (event) => {
      useStore.getState().handleSessionRoomTransitionApplied(event)
    })

    // Presence events
    dispatcher.register('PRESENCE:STATE_CHANGED', (event) => {
      useStore.getState().handlePresenceStateChanged(event)
    })

    // Audio events
    dispatcher.register('AUDIO:EFFECT_APPLIED', (event) => {
      useStore.getState().handleEffectApplied(event)
    })
    dispatcher.register('AUDIO:EFFECT_REMOVED', (event) => {
      useStore.getState().handleEffectRemoved(event)
    })
    dispatcher.register('AUDIO:PRESET_LOADED', (event) => {
      useStore.getState().handlePresetLoaded(event)
    })
    dispatcher.register('AUDIO:ENVIRONMENT_SET', (event) => {
      useStore.getState().handleEnvironmentSet(event)
    })
    dispatcher.register('AUDIO:DM_OVERRIDE_APPLIED', (event) => {
      useStore.getState().handleDMOverrideApplied(event)
    })
    dispatcher.register('AUDIO:DM_OVERRIDE_REMOVED', (event) => {
      useStore.getState().handleDMOverrideRemoved(event)
    })
    dispatcher.register('AUDIO:VOICE_OF_GOD_CHANGED', (event) => {
      useStore.getState().handleVoiceOfGodChanged(event)
    })

    // Metadata events (WS internal)
    dispatcher.register('WS:CONNECTED', (event) => {
      useStore.getState().handleConnectionEstablished(event)
    })

    clientRef.current = client
    dispatcherRef.current = dispatcher

    // Connect
    client.connect().catch((err) => {
      logger.error('ws.hook', 'Failed to connect', err)
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
  }, [enabled, token, url])

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
