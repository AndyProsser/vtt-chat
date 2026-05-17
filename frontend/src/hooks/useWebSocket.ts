/**
 * useWebSocket Hook
 * Manages WebSocket connection lifecycle and event dispatching.
 * Integrates with Zustand store through event handlers.
 */

import { useEffect, useRef, useState } from 'react'
import type { EventEnvelope } from '@shared'
import type { UUID } from '@shared'
import { isGreenroomSessionState } from '@shared'
import { isGreenRoomName } from '../constants/roomPresence.constants'
import { WebSocketClient, type ConnectionState } from '../ws/client'
import { EventDispatcher } from '../ws/dispatcher'
import { useStore } from './useStore'
import { logger } from '../utils/logger'

export interface UseWebSocketOptions {
  url: string
  token: string
  sessionId?: UUID | null
  enabled?: boolean
  onAuthFailure?: (reason: string) => void
}

export interface UseWebSocketReturn {
  state: ConnectionState
  send: (event: EventEnvelope) => void
  retryConnection: () => Promise<void>
  isConnected: boolean
  error: Error | null
}

/**
 * Hook for managing WebSocket connection and event dispatching.
 * Automatically connects/disconnects based on token availability.
 * Registers event handlers with the store.
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { url, token, sessionId = null, enabled = true, onAuthFailure } = options

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
      sessionId,
      onStateChange: (nextState) => {
        setState(nextState)
        if (
          nextState === 'connected' ||
          nextState === 'connecting' ||
          nextState === 'reconnecting'
        ) {
          setError(null)
        }
      },
      onError: setError,
      onAuthFailure,
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
    dispatcher.register('SESSION:COOLDOWN_STARTED', (event) => {
      useStore.getState().handleSessionCooldownStarted(event)
    })
    dispatcher.register('SESSION:COOLDOWN_EXTENDED', (event) => {
      useStore.getState().handleSessionCooldownExtended(event)
    })
    dispatcher.register('SESSION:COOLDOWN_ENDED', (event) => {
      useStore.getState().handleSessionCooldownEnded(event)
    })
    dispatcher.register('SESSION:ENDED', (event) => {
      const store = useStore.getState()
      store.handleSessionEnded(event)
      store.resetSessionAudioState()
      store.clearActiveEffects()
    })
    dispatcher.register('SESSION:STATS_UPDATED', (event) => {
      useStore.getState().handleSessionStatsUpdated(event)
    })

    // Chat events
    dispatcher.register('CHAT:MESSAGE_SENT', (event) => {
      const store = useStore.getState()

      if (event.sessionId) {
        store.handleMessageSent(event)
        return
      }

      store.handleGreenroomMessageSent(event)

      // Campaign-scoped greenroom messages arrive without sessionId/roomId.
      // Bind them to the active session's greenroom room so live chat renders immediately.
      if (!sessionId) {
        return
      }

      const sessionRooms = (store.rooms as Record<UUID, Record<UUID, { id: UUID; name: string }>>)[
        sessionId
      ]

      if (!sessionRooms) {
        return
      }

      const greenroom = Object.values(sessionRooms).find((room) => isGreenRoomName(room.name))
      if (!greenroom) {
        return
      }

      const payload = (event.payload || {}) as Record<string, unknown>
      const bridgedRoomId = (payload.roomId as UUID | undefined) || greenroom.id
      const bridgedEvent: EventEnvelope = {
        ...event,
        sessionId,
        roomId: bridgedRoomId,
        payload: {
          ...payload,
          roomId: bridgedRoomId,
        },
      }

      store.handleMessageSent(bridgedEvent)
    })
    dispatcher.register('CHAT:MESSAGE_EDITED', (event) => {
      const store = useStore.getState()
      if (event.sessionId) {
        store.handleMessageEdited(event)
        return
      }

      store.handleGreenroomMessageEdited(event)
    })
    dispatcher.register('CHAT:MESSAGE_DELETED', (event) => {
      const store = useStore.getState()
      if (event.sessionId) {
        store.handleMessageDeleted(event)
        return
      }

      store.handleGreenroomMessageDeleted(event)
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
    dispatcher.register('ROOM:DELETED', (event) => {
      const payload = event.payload as { roomId?: UUID }
      if (!payload.roomId) {
        return
      }

      const store = useStore.getState()
      const deletedEnvironmentName = store.roomEnvironmentNames[payload.roomId]
      store.deleteRoom(event.sessionId as UUID, payload.roomId)
      store.clearRoomEnvironmentName(payload.roomId)

      if (
        deletedEnvironmentName &&
        store.currentEnvironment?.name?.toLowerCase() === deletedEnvironmentName.toLowerCase()
      ) {
        store.clearEnvironment()
      }
    })
    dispatcher.register('ROOM:SESSION_TRANSITION_APPLIED', (event) => {
      const store = useStore.getState()
      store.handleSessionRoomTransitionApplied(event)
      // Clear per-session audio presets when transitioning to greenroom or session end
      const payload = event.payload as { nextState?: import('@shared').SessionState | null }
      if (isGreenroomSessionState(payload.nextState)) {
        store.resetSessionAudioState()
        store.clearActiveEffects()
      }
    })

    // Presence events
    dispatcher.register('PRESENCE:STATE_CHANGED', (event) => {
      useStore.getState().handlePresenceStateChanged(event)
    })
    dispatcher.register('PRESENCE:USER_GHOST_MODE_CHANGED', (event) => {
      useStore.getState().handlePresenceGhostModeChanged(event)
    })
    dispatcher.register('PRESENCE:PROFILE_UPDATED', (event) => {
      useStore.getState().handlePresenceProfileUpdated(event)
    })

    // Audio events
    dispatcher.register('AUDIO:DM_VOICE_MODE_CHANGED', (event) => {
      useStore.getState().handleDmVoiceModeChanged(event)
    })
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
    dispatcher.register('AUDIO:BROADCAST_STATE_CHANGED', (event) => {
      useStore.getState().handleBroadcastStateChanged(event)
    })
    dispatcher.register('AUDIO:VOICE_OF_GOD_CHANGED', (event) => {
      useStore.getState().handleBroadcastStateChanged(event)
    })
    dispatcher.register('AUDIO:USER_MUTED', (event) => {
      useStore.getState().handleUserMuted(event)
    })
    dispatcher.register('AUDIO:USER_UNMUTED', (event) => {
      useStore.getState().handleUserUnmuted(event)
    })

    // Metadata events (WS internal)
    dispatcher.register('WS:CONNECTED', (event) => {
      useStore.getState().handleConnectionEstablished(event)
    })

    clientRef.current = client
    dispatcherRef.current = dispatcher

    // Delay connect by one tick so StrictMode mount/unmount churn can cancel
    // before transport starts, reducing noisy refresh-time browser WS warnings.
    let cancelled = false
    const connectTimeoutId = setTimeout(() => {
      if (cancelled) {
        return
      }

      client.connect().catch((err) => {
        logger.error('ws.hook', 'Failed to connect', err)
        setError(err)
      })
    }, 0)

    // Cleanup
    return () => {
      cancelled = true
      clearTimeout(connectTimeoutId)

      if (clientRef.current) {
        clientRef.current.disconnect()
        clientRef.current = null
      }
      dispatcherRef.current = null
    }
  }, [enabled, onAuthFailure, sessionId, token, url])

  const send = (event: EventEnvelope) => {
    if (clientRef.current) {
      clientRef.current.send(event)
    }
  }

  const retryConnection = async () => {
    const client = clientRef.current
    if (!client) {
      return
    }

    setError(null)
    client.disconnect()

    try {
      await client.connect()
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    }
  }

  return {
    state,
    send,
    retryConnection,
    isConnected: state === 'connected',
    error,
  }
}
