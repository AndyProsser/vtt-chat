/**
 * Manages LiveKit room connection, token exchange, and track lifecycle.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioPresets,
  ConnectionState,
  Room,
  RoomEvent,
  LocalAudioTrack,
  LocalVideoTrack,
  type RemoteParticipant,
} from 'livekit-client'
import { useStore } from './useStore'
import { logger } from '../utils/logger'

interface TrackSubscription {
  participantId: string
  trackSid: string
  trackName: string
  trackKind: 'audio' | 'video'
}

export interface UseLiveKitReturn {
  connectionState: ConnectionState
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  room: Room | null
  localAudioTrack: LocalAudioTrack | null
  localInputTrack: MediaStreamTrack | null
  localVideoTrack: LocalVideoTrack | null
  remoteParticipants: ReadonlyMap<string, RemoteParticipant>
  publishAudio: () => Promise<void>
  unpublishAudio: () => Promise<void>
  disconnect: () => Promise<void>
}

export interface UseLiveKitOptions {
  /** Called when a remote audio MediaStream is subscribed */
  onTrackSubscribed?: (
    trackSid: string,
    mediaStream: MediaStream,
    meta: { participantIdentity: string }
  ) => void
  /** Called when a remote audio track is unsubscribed */
  onTrackUnsubscribed?: (trackSid: string) => void
  /** Token channel requested from backend. */
  tokenChannel?: 'room' | 'broadcast' | 'voice_of_god'
}

function shouldSuppressLiveKitTestError(error: unknown): boolean {
  if (import.meta.env.MODE !== 'test') {
    return false
  }

  const message = error instanceof Error ? error.message : String(error)
  return message.includes('Missing auth token for LiveKit token request')
}

function safeStorageGetItem(storage: Storage | undefined, key: string): string | null {
  if (!storage || typeof storage.getItem !== 'function') {
    return null
  }

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function isLoopbackLiveKitUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    )
  } catch {
    return false
  }
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export function buildLiveKitConnectionKey(
  sessionId: string,
  roomId: string,
  channel: 'room' | 'broadcast' | 'voice_of_god'
): string {
  return `${channel}:${sessionId}:${roomId}`
}

export function useLiveKit(
  sessionId: string,
  roomId: string,
  options: UseLiveKitOptions = {}
): UseLiveKitReturn {
  const roomListenerDiagEnabled = import.meta.env.DEV
  const { onTrackSubscribed, onTrackUnsubscribed, tokenChannel = 'room' } = options
  const dualRoomHandoffEnabled =
    tokenChannel === 'room' && import.meta.env.VITE_LIVEKIT_DUAL_ROOM_HANDOFF === '1'
  const dualRoomHandoffMaxOverlapMs = Math.max(
    500,
    Number.parseInt(import.meta.env.VITE_LIVEKIT_DUAL_ROOM_HANDOFF_MAX_MS ?? '2500', 10) || 2500
  )
  const dualRoomMirrorPublishEnabled =
    dualRoomHandoffEnabled && import.meta.env.VITE_LIVEKIT_DUAL_ROOM_MIRROR_PUBLISH === '1'
  const dualRoomMirrorPublishMaxMs = Math.max(
    250,
    Number.parseInt(import.meta.env.VITE_LIVEKIT_DUAL_ROOM_MIRROR_MAX_MS ?? '900', 10) || 900
  )
  const connectionKey = buildLiveKitConnectionKey(sessionId, roomId, tokenChannel)
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected
  )
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [localAudioTrack, setLocalAudioTrack] = useState<LocalAudioTrack | null>(null)
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null)
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(
    () => new Map()
  )
  const [hasUserActivation, setHasUserActivation] = useState(() => {
    if (typeof navigator === 'undefined') {
      return true
    }

    return Boolean(navigator.userActivation?.hasBeenActive)
  })

  const roomRef = useRef<Room | null>(null)
  const localAudioRef = useRef<LocalAudioTrack | null>(null)
  const localVideoRef = useRef<LocalVideoTrack | null>(null)
  const isMountedRef = useRef(true)
  const isConnectingRef = useRef(false)
  const connectingTargetRef = useRef<string | null>(null)
  const connectionAttemptRef = useRef(0)
  const connectionKeyRef = useRef<string | null>(null)
  const hasLocalPublicationRef = useRef(false)
  const publishAudioInFlightRef = useRef<Promise<void> | null>(null)
  const publishGenerationRef = useRef(0)
  const trackSubscriptionsRef = useRef<TrackSubscription[]>([])
  const teardownRoomListenersRef = useRef<(() => void) | null>(null)
  const roomListenerCountsRef = useRef<Record<string, number>>({})
  const remoteAudioElementsRef = useRef(new Map<string, HTMLMediaElement>())
  const onTrackSubscribedRef = useRef(onTrackSubscribed)
  const onTrackUnsubscribedRef = useRef(onTrackUnsubscribed)
  const upsertLiveKitConnection = useStore((state) => state.upsertLiveKitConnection)
  const setLiveKitLocalInputTrack = useStore((state) => state.setLiveKitLocalInputTrack)
  const clearLiveKitConnection = useStore((state) => state.clearLiveKitConnection)
  const setLiveKitLocalInputTrackRef = useRef(setLiveKitLocalInputTrack)
  const cleanupConnectionKeyRef = useRef(connectionKey)
  const sharedLiveKitState = useStore((state) => state.livekitConnections?.[connectionKey] ?? null)
  const localInputTrack = useStore(
    (state) => state.livekitLocalInputTracks?.[connectionKey] ?? null
  )
  const device = useStore((state) => state.device)
  const pttActive = useStore((state) => state.pttActive)
  const selectedMicDeviceId = device?.selectedMicDeviceId ?? 'default'
  const noiseFilterLevel = device?.noiseFilterLevel ?? 'medium'
  const autoGainEnabled = device?.autoGainEnabled ?? true

  useEffect(() => {
    hasLocalPublicationRef.current = Boolean(sharedLiveKitState?.hasLocalPublication)
  }, [sharedLiveKitState?.hasLocalPublication])

  useEffect(() => {
    setLiveKitLocalInputTrackRef.current = setLiveKitLocalInputTrack
  }, [setLiveKitLocalInputTrack])

  useEffect(() => {
    cleanupConnectionKeyRef.current = connectionKey
  }, [connectionKey])

  const getHasLocalPublication = useCallback((targetRoom?: Room | null): boolean => {
    const roomToCheck = targetRoom ?? roomRef.current
    if (!roomToCheck) {
      return false
    }

    return Array.from(roomToCheck.localParticipant.audioTrackPublications.values()).some(
      (publication) => Boolean(publication.track)
    )
  }, [])

  const publishConnectionSnapshot = useCallback(
    (params: {
      connectionState: ConnectionState
      isConnected: boolean
      isConnecting: boolean
      hasLocalPublication?: boolean
      error?: string | null
    }) => {
      if (!sessionId || !roomId) {
        return
      }

      const previousHasLocalPublication = hasLocalPublicationRef.current
      const nextHasLocalPublication =
        params.hasLocalPublication ?? previousHasLocalPublication ?? false
      hasLocalPublicationRef.current = nextHasLocalPublication

      upsertLiveKitConnection(connectionKey, {
        sessionId,
        roomId,
        channel: tokenChannel,
        connectionState: params.connectionState,
        isConnected: params.isConnected,
        isConnecting: params.isConnecting,
        hasLocalPublication: nextHasLocalPublication,
        error: params.error,
      })
    },
    [connectionKey, roomId, sessionId, tokenChannel, upsertLiveKitConnection]
  )

  const setRoomState = useCallback((nextRoom: Room | null) => {
    roomRef.current = nextRoom
    if (isMountedRef.current) {
      setRoom(nextRoom)
    }
  }, [])

  const startRoomAudioAfterGesture = useCallback(async (targetRoom: Room | null) => {
    if (!targetRoom) {
      return
    }

    const roomWithStartAudio = targetRoom as Room & {
      startAudio?: () => Promise<void>
    }

    if (typeof roomWithStartAudio.startAudio !== 'function') {
      return
    }

    try {
      await roomWithStartAudio.startAudio()
    } catch (err) {
      logger.info(
        'useLiveKit',
        `Audio playback resume deferred: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }, [])

  useEffect(() => {
    if (hasUserActivation || typeof window === 'undefined') {
      return
    }

    const markActivated = () => {
      setHasUserActivation(true)
      void startRoomAudioAfterGesture(roomRef.current)
    }

    window.addEventListener('pointerdown', markActivated, { once: true, passive: true })
    window.addEventListener('keydown', markActivated, { once: true })

    return () => {
      window.removeEventListener('pointerdown', markActivated)
      window.removeEventListener('keydown', markActivated)
    }
  }, [hasUserActivation, startRoomAudioAfterGesture])

  const setLocalAudioTrackState = useCallback((nextTrack: LocalAudioTrack | null) => {
    localAudioRef.current = nextTrack
    if (isMountedRef.current) {
      setLocalAudioTrack(nextTrack)
    }
  }, [])

  const setLocalVideoTrackState = useCallback((nextTrack: LocalVideoTrack | null) => {
    localVideoRef.current = nextTrack
    if (isMountedRef.current) {
      setLocalVideoTrack(nextTrack)
    }
  }, [])

  const clearRemoteAudioElements = useCallback(() => {
    remoteAudioElementsRef.current.forEach((element) => element.remove())
    remoteAudioElementsRef.current.clear()
  }, [])

  const incrementRoomListenerCount = useCallback(
    (event: RoomEvent) => {
      if (!roomListenerDiagEnabled) {
        return
      }

      const key = String(event)
      const next = roomListenerCountsRef.current[key] || 0
      roomListenerCountsRef.current[key] = next + 1
    },
    [roomListenerDiagEnabled]
  )

  const decrementRoomListenerCount = useCallback(
    (event: RoomEvent) => {
      if (!roomListenerDiagEnabled) {
        return
      }

      const key = String(event)
      const current = roomListenerCountsRef.current[key] || 0
      const next = Math.max(0, current - 1)
      if (next === 0) {
        delete roomListenerCountsRef.current[key]
      } else {
        roomListenerCountsRef.current[key] = next
      }
    },
    [roomListenerDiagEnabled]
  )

  const logRoomListenerSnapshot = useCallback(
    (phase: 'register' | 'teardown') => {
      if (!roomListenerDiagEnabled) {
        return
      }

      const counts = roomListenerCountsRef.current
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
      logger.debug('useLiveKit', 'Room listener counters', {
        phase,
        sessionId,
        roomId,
        tokenChannel,
        total,
        counts,
      })
    },
    [roomId, roomListenerDiagEnabled, sessionId, tokenChannel]
  )

  const logConnectionStartDiag = useCallback(
    (reason: string, extra?: Record<string, unknown>) => {
      if (!roomListenerDiagEnabled) {
        return
      }

      logger.debug('useLiveKit', 'Connection start diagnostic', {
        reason,
        sessionId,
        roomId,
        tokenChannel,
        hasUserActivation,
        hasActiveRoom: Boolean(roomRef.current),
        isConnecting: isConnectingRef.current,
        hasLocalAudioTrack: Boolean(localAudioRef.current),
        connectingTarget: connectingTargetRef.current,
        activeConnectionKey: connectionKeyRef.current,
        ...extra,
      })
    },
    [hasUserActivation, roomId, roomListenerDiagEnabled, sessionId, tokenChannel]
  )

  const teardownRoomListeners = useCallback(() => {
    if (teardownRoomListenersRef.current) {
      teardownRoomListenersRef.current()
      teardownRoomListenersRef.current = null
    }
  }, [])

  const invalidatePendingPublish = useCallback(() => {
    publishGenerationRef.current += 1
    publishAudioInFlightRef.current = null
  }, [])

  const isPublishSuperseded = useCallback(
    (params: {
      targetRoom?: Room | null
      targetConnectionKey: string
      publishGeneration: number
      attemptId?: number
    }): boolean => {
      if (!isMountedRef.current) {
        return true
      }

      if (publishGenerationRef.current !== params.publishGeneration) {
        return true
      }

      if (
        typeof params.attemptId === 'number' &&
        connectionAttemptRef.current !== params.attemptId
      ) {
        return true
      }

      if (params.targetRoom && roomRef.current !== params.targetRoom) {
        return true
      }

      const activeConnectionKey = connectionKeyRef.current
      if (activeConnectionKey && activeConnectionKey !== params.targetConnectionKey) {
        return true
      }

      const connectingTargetKey = connectingTargetRef.current
      if (
        !activeConnectionKey &&
        connectingTargetKey &&
        connectingTargetKey !== params.targetConnectionKey
      ) {
        return true
      }

      return false
    },
    []
  )

  useEffect(() => {
    // StrictMode runs effect cleanup probes in dev; reset mounted flag on each setup.
    isMountedRef.current = true

    return () => {
      // Unmount cleanup: tear down media/room without relying on state setters.
      connectionAttemptRef.current += 1
      isConnectingRef.current = false
      connectingTargetRef.current = null
      invalidatePendingPublish()

      const activeAudioTrack = localAudioRef.current
      if (activeAudioTrack) {
        activeAudioTrack.stop()
      }

      const activeRoom = roomRef.current
      roomRef.current = null
      connectionKeyRef.current = null

      teardownRoomListeners()

      if (activeRoom) {
        void activeRoom.disconnect()
      }

      // Post-disconnect parity: run teardown again in case transport-level callbacks
      // registered late and populated the teardown ref while disconnect was in flight.
      teardownRoomListeners()

      trackSubscriptionsRef.current = []
      clearRemoteAudioElements()

      const clearLocalInputTrack = setLiveKitLocalInputTrackRef.current
      if (typeof clearLocalInputTrack === 'function') {
        clearLocalInputTrack(cleanupConnectionKeyRef.current, null)
      }

      isMountedRef.current = false
    }
  }, [clearRemoteAudioElements, invalidatePendingPublish, teardownRoomListeners])

  // Keep callback refs up to date without triggering reconnects
  useEffect(() => {
    onTrackSubscribedRef.current = onTrackSubscribed
  }, [onTrackSubscribed])
  useEffect(() => {
    onTrackUnsubscribedRef.current = onTrackUnsubscribed
  }, [onTrackUnsubscribed])

  const isExpectedDisconnectError = useCallback((value: unknown): boolean => {
    const message = (value instanceof Error ? value.message : String(value)).toLowerCase()
    return message.includes('client initiated disconnect')
  }, [])

  const getLocalAudioConstraints = useCallback((): MediaTrackConstraints => {
    const noiseSuppression = noiseFilterLevel !== 'low'
    const echoCancellation = noiseFilterLevel !== 'low'

    return {
      deviceId:
        selectedMicDeviceId && selectedMicDeviceId !== 'default'
          ? { exact: selectedMicDeviceId }
          : undefined,
      channelCount: 1,
      echoCancellation,
      noiseSuppression,
      autoGainControl: autoGainEnabled,
    }
  }, [autoGainEnabled, noiseFilterLevel, selectedMicDeviceId])

  /**
   * Fetch a room-scoped LiveKit token from the backend.
   */
  const fetchToken = useCallback(async (): Promise<{ token: string; url: string } | null> => {
    try {
      const authToken =
        (typeof window !== 'undefined'
          ? safeStorageGetItem(window.sessionStorage, 'authToken')
          : null) ||
        (typeof window !== 'undefined'
          ? safeStorageGetItem(window.localStorage, 'authToken')
          : null)

      if (!authToken) {
        throw new Error('Missing auth token for LiveKit token request')
      }

      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ sessionId, roomId, channel: tokenChannel }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message =
          typeof payload?.message === 'string' && payload.message.trim().length > 0
            ? payload.message
            : response.statusText || `HTTP ${response.status}`
        throw new Error(`Token request failed (${response.status}): ${message}`)
      }

      const data = await response.json()
      logger.info('useLiveKit', 'Received LiveKit token endpoint URL', {
        sessionId,
        roomId,
        tokenChannel,
        tokenUrl: data.url,
      })

      const browserHost =
        typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : 'localhost'
      const shouldWarnLoopbackTarget =
        typeof data.url === 'string' &&
        isLoopbackLiveKitUrl(data.url) &&
        !isLoopbackHost(browserHost)

      if (shouldWarnLoopbackTarget) {
        logger.warn('useLiveKit', 'LiveKit token URL points to loopback; remote clients may fail', {
          sessionId,
          roomId,
          tokenChannel,
          tokenUrl: data.url,
        })
      }

      return { token: data.token, url: data.url }
    } catch (err) {
      if (!shouldSuppressLiveKitTestError(err)) {
        logger.error(
          'useLiveKit',
          `Token fetch failed: ${err instanceof Error ? err.message : String(err)}`
        )
      }
      throw err
    }
  }, [roomId, sessionId, tokenChannel])

  /**
   * Connect to LiveKit room
   */
  const connect = useCallback(async () => {
    if (isConnectingRef.current || roomRef.current) {
      logConnectionStartDiag('connect_skipped_already_active')
      return
    }

    const targetConnectionKey = `${sessionId}:${roomId}:${tokenChannel}`

    const attemptId = connectionAttemptRef.current + 1
    connectionAttemptRef.current = attemptId
    isConnectingRef.current = true
    connectingTargetRef.current = targetConnectionKey

    if (isMountedRef.current) {
      setConnectionState(ConnectionState.Connecting)
      setIsConnecting(true)
      setError(null)
    }
    logConnectionStartDiag('connect_start', { targetConnectionKey, attemptId })

    publishConnectionSnapshot({
      connectionState: ConnectionState.Connecting,
      isConnected: false,
      isConnecting: true,
      hasLocalPublication: false,
      error: null,
    })

    let nextRoom: Room | null = null

    try {
      const tokenData = await fetchToken()
      if (!tokenData) {
        throw new Error('Failed to fetch LiveKit token')
      }

      if (!isMountedRef.current) {
        isConnectingRef.current = false
        connectingTargetRef.current = null
        return
      }

      if (connectionAttemptRef.current !== attemptId) {
        return
      }

      nextRoom = new Room()

      if (!isMountedRef.current) {
        await nextRoom.disconnect()
        isConnectingRef.current = false
        connectingTargetRef.current = null
        return
      }

      if (connectionAttemptRef.current !== attemptId) {
        await nextRoom.disconnect()
        return
      }

      roomRef.current = nextRoom
      setRoomState(nextRoom)

      // Remove any stale listener set before attaching handlers for this room.
      teardownRoomListeners()

      const handleConnected = () => {
        if (roomRef.current !== nextRoom || connectionAttemptRef.current !== attemptId) {
          return
        }

        logger.info('useLiveKit', `Connected to room ${roomId}`)
        if (isMountedRef.current) {
          setIsConnected(true)
          setIsConnecting(false)
        }
        isConnectingRef.current = false
        connectingTargetRef.current = null
      }

      const handleConnectionFlags = () => {
        const activeRoom = roomRef.current
        if (!activeRoom || activeRoom !== nextRoom || connectionAttemptRef.current !== attemptId) {
          return
        }

        const roomState = activeRoom.state
        const nextIsConnected = roomState === ConnectionState.Connected
        const nextIsConnecting =
          roomState === ConnectionState.Connecting ||
          roomState === ConnectionState.Reconnecting ||
          roomState === ConnectionState.SignalReconnecting

        isConnectingRef.current = nextIsConnecting
        if (!nextIsConnecting) {
          connectingTargetRef.current = null
        }
        if (isMountedRef.current) {
          setConnectionState(roomState)
          setIsConnected(nextIsConnected)
          setIsConnecting(nextIsConnecting)
        }
        publishConnectionSnapshot({
          connectionState: roomState,
          isConnected: nextIsConnected,
          isConnecting: nextIsConnecting,
          hasLocalPublication: getHasLocalPublication(activeRoom),
          error: null,
        })
      }

      const handleDisconnected = () => {
        if (roomRef.current !== nextRoom) {
          return
        }

        logger.info('useLiveKit', `Disconnected from room ${roomId}`)
        isConnectingRef.current = false
        connectingTargetRef.current = null
        if (isMountedRef.current) {
          setConnectionState(ConnectionState.Disconnected)
          setIsConnected(false)
          setIsConnecting(false)
        }
        publishConnectionSnapshot({
          connectionState: ConnectionState.Disconnected,
          isConnected: false,
          isConnecting: false,
          hasLocalPublication: false,
          error: null,
        })
      }

      const handleLocalTrackPublished = () => {
        const activeRoom = roomRef.current ?? nextRoom
        if (!activeRoom) {
          return
        }

        const roomState = activeRoom.state
        publishConnectionSnapshot({
          connectionState: roomState,
          isConnected: roomState === ConnectionState.Connected,
          isConnecting:
            roomState === ConnectionState.Connecting ||
            roomState === ConnectionState.Reconnecting ||
            roomState === ConnectionState.SignalReconnecting,
          hasLocalPublication: getHasLocalPublication(activeRoom),
          error: null,
        })
      }

      const handleLocalTrackUnpublished = () => {
        const activeRoom = roomRef.current ?? nextRoom
        if (!activeRoom) {
          return
        }

        const roomState = activeRoom.state
        publishConnectionSnapshot({
          connectionState: roomState,
          isConnected: roomState === ConnectionState.Connected,
          isConnecting:
            roomState === ConnectionState.Connecting ||
            roomState === ConnectionState.Reconnecting ||
            roomState === ConnectionState.SignalReconnecting,
          hasLocalPublication: getHasLocalPublication(activeRoom),
          error: null,
        })
      }

      const handleParticipantConnected = (participant: RemoteParticipant) => {
        if (roomRef.current !== nextRoom || !isMountedRef.current) {
          return
        }

        logger.info('useLiveKit', `Participant connected: ${participant.identity}`)
        setRemoteParticipants((prev) => new Map(prev).set(participant.sid, participant))
      }

      const handleParticipantDisconnected = (participant: RemoteParticipant) => {
        if (roomRef.current !== nextRoom || !isMountedRef.current) {
          return
        }

        logger.info('useLiveKit', `Participant disconnected: ${participant.identity}`)
        setRemoteParticipants((prev) => {
          const updated = new Map(prev)
          updated.delete(participant.sid)
          return updated
        })
      }

      const handleTrackSubscribed = (
        track: { kind: string; mediaStreamTrack: MediaStreamTrack; attach: () => HTMLMediaElement },
        publication: { trackSid: string; trackName: string },
        participant: { sid: string; identity: string }
      ) => {
        if (roomRef.current !== nextRoom) {
          return
        }

        logger.info('useLiveKit', `Track subscribed: ${track.kind} from ${participant.identity}`)
        trackSubscriptionsRef.current.push({
          participantId: participant.sid,
          trackSid: publication.trackSid,
          trackName: publication.trackName,
          trackKind: track.kind as 'audio' | 'video',
        })

        if (track.kind === 'audio') {
          const mediaStream = new MediaStream([track.mediaStreamTrack])
          // Hand off to audio engine for DSP processing if consumer provided a callback,
          // otherwise fall back to direct DOM attachment for passthrough playback.
          if (onTrackSubscribedRef.current) {
            onTrackSubscribedRef.current(publication.trackSid, mediaStream, {
              participantIdentity: participant.identity,
            })
          } else {
            const audioElement = track.attach()
            audioElement.autoplay = true
            audioElement.setAttribute('playsinline', 'true')
            audioElement.style.display = 'none'
            document.body.appendChild(audioElement)
            remoteAudioElementsRef.current.set(publication.trackSid, audioElement)
          }
        }
      }

      const handleTrackUnsubscribed = (
        track: { kind: string; detach: () => void },
        publication: { trackSid: string }
      ) => {
        if (roomRef.current !== nextRoom) {
          return
        }

        logger.info('useLiveKit', `Track unsubscribed: ${track.kind}`)
        trackSubscriptionsRef.current = trackSubscriptionsRef.current.filter(
          (t) => t.trackSid !== publication.trackSid
        )
        track.detach()

        if (onTrackUnsubscribedRef.current) {
          onTrackUnsubscribedRef.current(publication.trackSid)
        }

        const audioElement = remoteAudioElementsRef.current.get(publication.trackSid)
        if (audioElement) {
          audioElement.remove()
          remoteAudioElementsRef.current.delete(publication.trackSid)
        }
      }

      const roomWithListeners = nextRoom
      roomWithListeners.on(RoomEvent.Connected, handleConnected)
      incrementRoomListenerCount(RoomEvent.Connected)
      roomWithListeners.on(RoomEvent.ConnectionStateChanged, handleConnectionFlags)
      incrementRoomListenerCount(RoomEvent.ConnectionStateChanged)
      roomWithListeners.on(RoomEvent.Reconnecting, handleConnectionFlags)
      incrementRoomListenerCount(RoomEvent.Reconnecting)
      roomWithListeners.on(RoomEvent.SignalReconnecting, handleConnectionFlags)
      incrementRoomListenerCount(RoomEvent.SignalReconnecting)
      roomWithListeners.on(RoomEvent.Reconnected, handleConnectionFlags)
      incrementRoomListenerCount(RoomEvent.Reconnected)
      roomWithListeners.on(RoomEvent.Disconnected, handleDisconnected)
      incrementRoomListenerCount(RoomEvent.Disconnected)
      roomWithListeners.on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished)
      incrementRoomListenerCount(RoomEvent.LocalTrackPublished)
      roomWithListeners.on(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished)
      incrementRoomListenerCount(RoomEvent.LocalTrackUnpublished)
      roomWithListeners.on(RoomEvent.ParticipantConnected, handleParticipantConnected)
      incrementRoomListenerCount(RoomEvent.ParticipantConnected)
      roomWithListeners.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
      incrementRoomListenerCount(RoomEvent.ParticipantDisconnected)
      roomWithListeners.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
      incrementRoomListenerCount(RoomEvent.TrackSubscribed)
      roomWithListeners.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
      incrementRoomListenerCount(RoomEvent.TrackUnsubscribed)
      logRoomListenerSnapshot('register')

      teardownRoomListenersRef.current = () => {
        roomWithListeners.off(RoomEvent.Connected, handleConnected)
        decrementRoomListenerCount(RoomEvent.Connected)
        roomWithListeners.off(RoomEvent.ConnectionStateChanged, handleConnectionFlags)
        decrementRoomListenerCount(RoomEvent.ConnectionStateChanged)
        roomWithListeners.off(RoomEvent.Reconnecting, handleConnectionFlags)
        decrementRoomListenerCount(RoomEvent.Reconnecting)
        roomWithListeners.off(RoomEvent.SignalReconnecting, handleConnectionFlags)
        decrementRoomListenerCount(RoomEvent.SignalReconnecting)
        roomWithListeners.off(RoomEvent.Reconnected, handleConnectionFlags)
        decrementRoomListenerCount(RoomEvent.Reconnected)
        roomWithListeners.off(RoomEvent.Disconnected, handleDisconnected)
        decrementRoomListenerCount(RoomEvent.Disconnected)
        roomWithListeners.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished)
        decrementRoomListenerCount(RoomEvent.LocalTrackPublished)
        roomWithListeners.off(RoomEvent.LocalTrackUnpublished, handleLocalTrackUnpublished)
        decrementRoomListenerCount(RoomEvent.LocalTrackUnpublished)
        roomWithListeners.off(RoomEvent.ParticipantConnected, handleParticipantConnected)
        decrementRoomListenerCount(RoomEvent.ParticipantConnected)
        roomWithListeners.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
        decrementRoomListenerCount(RoomEvent.ParticipantDisconnected)
        roomWithListeners.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
        decrementRoomListenerCount(RoomEvent.TrackSubscribed)
        roomWithListeners.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed)
        decrementRoomListenerCount(RoomEvent.TrackUnsubscribed)
        logRoomListenerSnapshot('teardown')
      }

      if (connectionAttemptRef.current !== attemptId || !isMountedRef.current) {
        teardownRoomListeners()
        await nextRoom.disconnect()
        teardownRoomListeners()
        return
      }

      // Connect to room
      await nextRoom.connect(tokenData.url, tokenData.token, {
        autoSubscribe: true,
      })

      handleConnectionFlags()

      if (roomRef.current !== nextRoom || connectionAttemptRef.current !== attemptId) {
        teardownRoomListeners()
        await nextRoom.disconnect()
        teardownRoomListeners()
        return
      }

      setRoomState(nextRoom)
      // Keep UI state in sync even if the Connected event callback is delayed or missed.
      if (isMountedRef.current) {
        setConnectionState(ConnectionState.Connected)
        setIsConnected(true)
        setIsConnecting(false)
      }
      publishConnectionSnapshot({
        connectionState: ConnectionState.Connected,
        isConnected: true,
        isConnecting: false,
        hasLocalPublication: getHasLocalPublication(nextRoom),
        error: null,
      })
      isConnectingRef.current = false
      connectingTargetRef.current = null
      connectionKeyRef.current = targetConnectionKey
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      const supersededAttempt = connectionAttemptRef.current !== attemptId || !isMountedRef.current
      const expectedDisconnect = isExpectedDisconnectError(err) || supersededAttempt

      if (nextRoom && roomRef.current === nextRoom) {
        roomRef.current = null
      }
      setRoomState(null)

      if (nextRoom) {
        try {
          teardownRoomListeners()
          await nextRoom.disconnect()
          teardownRoomListeners()
        } catch {
          // Ignore cleanup failures after a failed connection attempt.
        }
      }

      if (expectedDisconnect) {
        logger.info('useLiveKit', `Connection cancelled: ${errorMsg}`)
      } else if (!shouldSuppressLiveKitTestError(err)) {
        logger.error('useLiveKit', `Connection failed: ${errorMsg}`)
      }
      isConnectingRef.current = false
      connectingTargetRef.current = null
      if (connectionKeyRef.current === targetConnectionKey) {
        connectionKeyRef.current = null
      }
      if (isMountedRef.current && connectionAttemptRef.current === attemptId) {
        if (expectedDisconnect) {
          setError(null)
          setConnectionState(ConnectionState.Disconnected)
          setIsConnecting(false)
          setIsConnected(false)
          publishConnectionSnapshot({
            connectionState: ConnectionState.Disconnected,
            isConnected: false,
            isConnecting: false,
            hasLocalPublication: false,
            error: null,
          })
          return
        }
        setError(errorMsg)
        setConnectionState(ConnectionState.Disconnected)
        setIsConnecting(false)
        setIsConnected(false)
      }
      publishConnectionSnapshot({
        connectionState: ConnectionState.Disconnected,
        isConnected: false,
        isConnecting: false,
        hasLocalPublication: false,
        error: expectedDisconnect ? null : errorMsg,
      })
    }
  }, [
    decrementRoomListenerCount,
    fetchToken,
    getHasLocalPublication,
    incrementRoomListenerCount,
    isExpectedDisconnectError,
    logConnectionStartDiag,
    logRoomListenerSnapshot,
    publishConnectionSnapshot,
    roomId,
    sessionId,
    setRoomState,
    teardownRoomListeners,
    tokenChannel,
  ])

  const attemptDualRoomHandoff = useCallback(
    async (targetConnectionKey: string): Promise<boolean> => {
      const previousRoom = roomRef.current
      const previousTeardown = teardownRoomListenersRef.current
      const previousConnectionKey = connectionKeyRef.current

      const mirrorLocalPublicationIfNeeded = async (
        targetRoom: Room
      ): Promise<LocalAudioTrack | null> => {
        if (!dualRoomMirrorPublishEnabled) {
          return null
        }

        const shouldMirrorForContinuity =
          device.microphoneOn &&
          (!device.pttEnabled || pttActive) &&
          getHasLocalPublication(previousRoom)

        if (!shouldMirrorForContinuity) {
          return null
        }

        const sourceInputTrack = localInputTrack ?? localAudioRef.current?.mediaStreamTrack
        if (!sourceInputTrack) {
          throw new Error('dual-room mirror requested but no local input track is available')
        }

        const clonedInputTrack = sourceInputTrack.clone()
        const mirroredTrack = new LocalAudioTrack(clonedInputTrack)

        try {
          await Promise.race([
            targetRoom.localParticipant.publishTrack(mirroredTrack, {
              audioPreset: { ...AudioPresets.music, maxBitrate: 128000 },
            }),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => {
                reject(new Error('dual-room mirror publish timeout'))
              }, dualRoomMirrorPublishMaxMs)
            }),
          ])
        } catch (err) {
          await targetRoom.localParticipant.unpublishTrack(mirroredTrack).catch(() => undefined)
          mirroredTrack.stop()
          throw err
        }

        setLocalAudioTrackState(mirroredTrack)
        if (typeof setLiveKitLocalInputTrack === 'function') {
          setLiveKitLocalInputTrack(connectionKey, clonedInputTrack)
        }

        logger.info('useLiveKit', 'Dual-room mirror publish succeeded', {
          targetConnectionKey,
          maxMirrorMs: dualRoomMirrorPublishMaxMs,
        })

        return mirroredTrack
      }

      if (!previousRoom || !previousConnectionKey) {
        return false
      }

      logConnectionStartDiag('dual_handoff_start', {
        targetConnectionKey,
        previousConnectionKey,
        maxOverlapMs: dualRoomHandoffMaxOverlapMs,
      })

      isConnectingRef.current = true
      connectingTargetRef.current = targetConnectionKey
      if (isMountedRef.current) {
        setConnectionState(ConnectionState.Reconnecting)
        setIsConnected(true)
        setIsConnecting(true)
        setError(null)
      }

      publishConnectionSnapshot({
        connectionState: ConnectionState.Reconnecting,
        isConnected: true,
        isConnecting: true,
        hasLocalPublication: getHasLocalPublication(previousRoom),
        error: null,
      })

      // Keep previous room alive during overlap attempt, but detach its teardown
      // from the active ref so connect() can attach the candidate room listeners.
      teardownRoomListenersRef.current = null
      roomRef.current = null
      connectionKeyRef.current = null

      let timeoutTriggered = false

      try {
        await Promise.race([
          connect(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => {
              timeoutTriggered = true
              reject(new Error('dual-room handoff overlap timeout'))
            }, dualRoomHandoffMaxOverlapMs)
          }),
        ])

        const currentRoom = roomRef.current
        if (
          !currentRoom ||
          currentRoom === previousRoom ||
          connectionKeyRef.current !== targetConnectionKey
        ) {
          throw new Error('dual-room handoff did not activate the target room')
        }

        await mirrorLocalPublicationIfNeeded(currentRoom)

        // Remove listeners from previous room and terminate it after swap.
        previousTeardown?.()
        await previousRoom.disconnect().catch(() => undefined)

        logger.info('useLiveKit', 'Dual-room handoff succeeded', {
          targetConnectionKey,
          previousConnectionKey,
        })
        return true
      } catch (err) {
        if (timeoutTriggered) {
          // Supersede any in-flight connect attempt that exceeded overlap guard.
          connectionAttemptRef.current += 1
        }

        const candidateRoom = roomRef.current as Room | null
        if (candidateRoom && candidateRoom !== previousRoom) {
          teardownRoomListeners()
          await (candidateRoom as Room).disconnect().catch(() => undefined)
          teardownRoomListeners()
        }

        // Roll back to previously connected room.
        roomRef.current = previousRoom
        if (isMountedRef.current) {
          setRoom(previousRoom)
        }
        teardownRoomListenersRef.current = previousTeardown ?? null
        connectionKeyRef.current = previousConnectionKey
        isConnectingRef.current = false
        connectingTargetRef.current = null

        const previousState = previousRoom.state
        if (isMountedRef.current) {
          setConnectionState(previousState)
          setIsConnected(previousState === ConnectionState.Connected)
          setIsConnecting(false)
          setError(null)
        }

        publishConnectionSnapshot({
          connectionState: previousState,
          isConnected: previousState === ConnectionState.Connected,
          isConnecting: false,
          hasLocalPublication: getHasLocalPublication(previousRoom),
          error: null,
        })

        logger.warn(
          'useLiveKit',
          `Dual-room handoff failed, rolled back: ${err instanceof Error ? err.message : String(err)}`,
          {
            targetConnectionKey,
            previousConnectionKey,
            timeoutTriggered,
          }
        )
        return false
      }
    },
    [
      connect,
      connectionKey,
      device.microphoneOn,
      device.pttEnabled,
      dualRoomHandoffMaxOverlapMs,
      dualRoomMirrorPublishEnabled,
      dualRoomMirrorPublishMaxMs,
      getHasLocalPublication,
      localInputTrack,
      logConnectionStartDiag,
      pttActive,
      publishConnectionSnapshot,
      setLiveKitLocalInputTrack,
      setLocalAudioTrackState,
      teardownRoomListeners,
    ]
  )

  const waitForRoomConnected = useCallback(async (targetRoom: Room, timeoutMs = 6000) => {
    if (targetRoom.state === ConnectionState.Connected) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false

      const cleanup = () => {
        targetRoom.off(RoomEvent.Connected, handleConnected)
        targetRoom.off(RoomEvent.Reconnected, handleConnected)
        targetRoom.off(RoomEvent.ConnectionStateChanged, handleStateChanged)
        targetRoom.off(RoomEvent.Disconnected, handleDisconnected)
      }

      const settle = (fn: () => void) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        cleanup()
        fn()
      }

      const handleConnected = () => {
        settle(resolve)
      }

      const handleStateChanged = () => {
        if (targetRoom.state === ConnectionState.Connected) {
          settle(resolve)
        }
      }

      const handleDisconnected = () => {
        settle(() => reject(new Error('Room disconnected before becoming connected')))
      }

      const timeout = window.setTimeout(() => {
        settle(() =>
          reject(new Error('publishing rejected as engine not connected within timeout'))
        )
      }, timeoutMs)

      targetRoom.on(RoomEvent.Connected, handleConnected)
      targetRoom.on(RoomEvent.Reconnected, handleConnected)
      targetRoom.on(RoomEvent.ConnectionStateChanged, handleStateChanged)
      targetRoom.on(RoomEvent.Disconnected, handleDisconnected)
      handleStateChanged()
    })
  }, [])

  /**
   * Publish the local microphone to the active room.
   */
  const publishAudio = useCallback(async () => {
    if (publishAudioInFlightRef.current) {
      return publishAudioInFlightRef.current
    }

    const publishGeneration = publishGenerationRef.current
    const targetConnectionKey = `${sessionId}:${roomId}:${tokenChannel}`
    const connectionAttemptAtStart = connectionAttemptRef.current

    const publishPromise = (async () => {
      let activeRoom = roomRef.current

      if (!activeRoom) {
        await connect()
        activeRoom = roomRef.current
      }

      if (
        isPublishSuperseded({
          targetRoom: activeRoom,
          targetConnectionKey,
          publishGeneration,
          attemptId: connectionAttemptAtStart,
        })
      ) {
        return
      }

      if (!activeRoom) {
        throw new Error('Room not connected')
      }

      if (activeRoom.state !== ConnectionState.Connected) {
        await waitForRoomConnected(activeRoom)
        if (
          isPublishSuperseded({
            targetRoom: activeRoom,
            targetConnectionKey,
            publishGeneration,
            attemptId: connectionAttemptAtStart,
          })
        ) {
          return
        }
      }

      if (getHasLocalPublication(activeRoom)) {
        publishConnectionSnapshot({
          connectionState: activeRoom.state,
          isConnected: activeRoom.state === ConnectionState.Connected,
          isConnecting:
            activeRoom.state === ConnectionState.Connecting ||
            activeRoom.state === ConnectionState.Reconnecting ||
            activeRoom.state === ConnectionState.SignalReconnecting,
          hasLocalPublication: true,
          error: null,
        })
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getLocalAudioConstraints(),
        })

        if (
          isPublishSuperseded({
            targetRoom: activeRoom,
            targetConnectionKey,
            publishGeneration,
            attemptId: connectionAttemptAtStart,
          })
        ) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        const inputTrack = stream.getAudioTracks()[0]

        const audioTrack = new LocalAudioTrack(inputTrack)
        await activeRoom.localParticipant.publishTrack(audioTrack, {
          audioPreset: { ...AudioPresets.music, maxBitrate: 128000 },
        })

        if (
          isPublishSuperseded({
            targetRoom: activeRoom,
            targetConnectionKey,
            publishGeneration,
            attemptId: connectionAttemptAtStart,
          })
        ) {
          await activeRoom.localParticipant.unpublishTrack(audioTrack).catch(() => undefined)
          audioTrack.stop()
          return
        }

        setLocalAudioTrackState(audioTrack)
        if (typeof setLiveKitLocalInputTrack === 'function') {
          setLiveKitLocalInputTrack(connectionKey, inputTrack)
        }
        publishConnectionSnapshot({
          connectionState: activeRoom.state,
          isConnected: activeRoom.state === ConnectionState.Connected,
          isConnecting:
            activeRoom.state === ConnectionState.Connecting ||
            activeRoom.state === ConnectionState.Reconnecting ||
            activeRoom.state === ConnectionState.SignalReconnecting,
          hasLocalPublication: getHasLocalPublication(activeRoom),
          error: null,
        })

        logger.info('useLiveKit', 'Audio track published')
      } catch (err) {
        if (
          isPublishSuperseded({
            targetRoom: activeRoom,
            targetConnectionKey,
            publishGeneration,
            attemptId: connectionAttemptAtStart,
          })
        ) {
          return
        }

        const message = err instanceof Error ? err.message : String(err)
        const isPermissionError = /insufficient permissions|not authorized|permission/i.test(
          message
        )

        if (isPermissionError) {
          logger.warn(
            'useLiveKit',
            `Audio publish permission denied, retrying after reconnect: ${message}`
          )
          // One-shot recovery: refresh token/permissions by reconnecting and retry once.
          const recoveryRoom = roomRef.current
          if (recoveryRoom) {
            await recoveryRoom.disconnect().catch(() => undefined)
          }
          roomRef.current = null
          connectionKeyRef.current = null
          setRoomState(null)
          setLocalAudioTrackState(null)
          if (typeof setLiveKitLocalInputTrack === 'function') {
            setLiveKitLocalInputTrack(connectionKey, null)
          }

          await connect()

          const recoveredRoom = roomRef.current as Room | null
          if (!recoveredRoom) {
            throw err
          }

          await waitForRoomConnected(recoveredRoom)

          const stream = await navigator.mediaDevices.getUserMedia({
            audio: getLocalAudioConstraints(),
          })

          const inputTrack = stream.getAudioTracks()[0]
          const retryTrack = new LocalAudioTrack(inputTrack)

          await recoveredRoom.localParticipant.publishTrack(retryTrack, {
            audioPreset: { ...AudioPresets.music, maxBitrate: 128000 },
          })

          setLocalAudioTrackState(retryTrack)
          if (typeof setLiveKitLocalInputTrack === 'function') {
            setLiveKitLocalInputTrack(connectionKey, inputTrack)
          }
          publishConnectionSnapshot({
            connectionState: recoveredRoom.state,
            isConnected: recoveredRoom.state === ConnectionState.Connected,
            isConnecting:
              recoveredRoom.state === ConnectionState.Connecting ||
              recoveredRoom.state === ConnectionState.Reconnecting ||
              recoveredRoom.state === ConnectionState.SignalReconnecting,
            hasLocalPublication: getHasLocalPublication(recoveredRoom),
            error: null,
          })

          logger.info('useLiveKit', 'Audio track published after permission recovery reconnect')
          return
        }

        logger.error('useLiveKit', `Audio publish failed: ${message}`)
        throw err
      }
    })()

    publishAudioInFlightRef.current = publishPromise
    try {
      await publishPromise
    } finally {
      if (publishAudioInFlightRef.current === publishPromise) {
        publishAudioInFlightRef.current = null
      }
    }
  }, [
    connect,
    connectionKey,
    getHasLocalPublication,
    getLocalAudioConstraints,
    isPublishSuperseded,
    publishConnectionSnapshot,
    roomId,
    sessionId,
    setLiveKitLocalInputTrack,
    setLocalAudioTrackState,
    setRoomState,
    tokenChannel,
    waitForRoomConnected,
  ])

  /**
   * Unpublish local audio track
   */
  const unpublishAudio = useCallback(async () => {
    const activeRoom = roomRef.current
    const activeAudioTrack = localAudioRef.current

    if (activeRoom && activeAudioTrack) {
      await activeRoom.localParticipant.unpublishTrack(activeAudioTrack)
      activeAudioTrack.stop()
      setLocalAudioTrackState(null)
      if (typeof setLiveKitLocalInputTrack === 'function') {
        setLiveKitLocalInputTrack(connectionKey, null)
      }
      publishConnectionSnapshot({
        connectionState: activeRoom.state,
        isConnected: activeRoom.state === ConnectionState.Connected,
        isConnecting:
          activeRoom.state === ConnectionState.Connecting ||
          activeRoom.state === ConnectionState.Reconnecting ||
          activeRoom.state === ConnectionState.SignalReconnecting,
        hasLocalPublication: getHasLocalPublication(activeRoom),
        error: null,
      })
      logger.info('useLiveKit', 'Audio track unpublished')
    }
  }, [
    connectionKey,
    getHasLocalPublication,
    publishConnectionSnapshot,
    setLiveKitLocalInputTrack,
    setLocalAudioTrackState,
  ])

  /**
   * Disconnect from the current room and clear local state.
   */
  const disconnect = useCallback(async () => {
    const hasActiveRoom = Boolean(roomRef.current)
    const hasInFlightConnection = isConnectingRef.current
    const hasActiveAudioTrack = Boolean(localAudioRef.current)

    if (!hasActiveRoom && !hasInFlightConnection && !hasActiveAudioTrack) {
      return
    }

    connectionAttemptRef.current += 1
    isConnectingRef.current = false
    connectingTargetRef.current = null
    invalidatePendingPublish()

    const activeRoom = roomRef.current
    const activeAudioTrack = localAudioRef.current

    if (activeAudioTrack) {
      activeAudioTrack.stop()
    }

    if (activeRoom) {
      try {
        teardownRoomListeners()
        await activeRoom.disconnect()
        teardownRoomListeners()
      } catch (err) {
        if (!isExpectedDisconnectError(err)) {
          logger.warn(
            'useLiveKit',
            `Disconnect failed: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }

    setRoomState(null)
    setLocalAudioTrackState(null)
    if (typeof setLiveKitLocalInputTrack === 'function') {
      setLiveKitLocalInputTrack(connectionKey, null)
    }
    setLocalVideoTrackState(null)
    trackSubscriptionsRef.current = []
    clearRemoteAudioElements()

    if (isMountedRef.current) {
      setRemoteParticipants(new Map())
      setConnectionState(ConnectionState.Disconnected)
      setIsConnected(false)
      setIsConnecting(false)
      logger.info('useLiveKit', 'Disconnected from room')
    }
    publishConnectionSnapshot({
      connectionState: ConnectionState.Disconnected,
      isConnected: false,
      isConnecting: false,
      hasLocalPublication: false,
      error: null,
    })

    connectionKeyRef.current = null
  }, [
    clearRemoteAudioElements,
    connectionKey,
    isExpectedDisconnectError,
    publishConnectionSnapshot,
    setLiveKitLocalInputTrack,
    setLocalAudioTrackState,
    setLocalVideoTrackState,
    setRoomState,
    teardownRoomListeners,
    invalidatePendingPublish,
  ])

  /**
   * Start a connection when session, room, and user context are all present.
   */
  useEffect(() => {
    if (!sessionId || !roomId) {
      logConnectionStartDiag('effect_early_return_missing_session_or_room')
      if (roomRef.current || isConnectingRef.current || localAudioRef.current) {
        logConnectionStartDiag('effect_disconnect_due_to_missing_session_or_room')
        void disconnect()
      }
      return
    }

    let cancelled = false
    let startTimer: ReturnType<typeof setTimeout> | null = null
    const targetConnectionKey = `${sessionId}:${roomId}:${tokenChannel}`

    const startConnection = async () => {
      if (cancelled) {
        logConnectionStartDiag('effect_early_return_cancelled_before_start')
        return
      }

      logConnectionStartDiag('effect_start_connection', { targetConnectionKey })

      // If room target changed, replace stale connection work before connecting.
      const hasStaleConnectedRoom =
        Boolean(roomRef.current) && connectionKeyRef.current !== targetConnectionKey
      const hasStaleInFlightRoom =
        isConnectingRef.current && connectingTargetRef.current !== targetConnectionKey

      if (hasStaleConnectedRoom) {
        if (dualRoomHandoffEnabled) {
          logConnectionStartDiag('effect_dual_handoff_attempt', { targetConnectionKey })
          const handoffSucceeded = await attemptDualRoomHandoff(targetConnectionKey)
          if (handoffSucceeded) {
            return
          }
          logConnectionStartDiag('effect_dual_handoff_fallback_legacy', { targetConnectionKey })
        }

        logConnectionStartDiag('effect_disconnect_stale_connected_room', { targetConnectionKey })
        invalidatePendingPublish()
        await disconnect()
      } else if (hasStaleInFlightRoom) {
        logConnectionStartDiag('effect_invalidate_stale_inflight_room', { targetConnectionKey })
        // Avoid disconnecting while offer negotiation is in-flight; invalidate and replace.
        connectionAttemptRef.current += 1
        isConnectingRef.current = false
        connectingTargetRef.current = null
        invalidatePendingPublish()
        teardownRoomListeners()
        roomRef.current = null
        connectionKeyRef.current = null

        if (isMountedRef.current) {
          setRoom(null)
          setConnectionState(ConnectionState.Disconnected)
          setIsConnected(false)
          setIsConnecting(false)
        }
      }

      if (!cancelled) {
        // WebRTC signaling/socket setup does not require a user gesture.
        // Keep autoplay handling gesture-gated via startRoomAudioAfterGesture.
        logConnectionStartDiag('effect_call_connect', { targetConnectionKey })
        await connect()
      } else {
        logConnectionStartDiag('effect_early_return_cancelled_before_connect')
      }
    }

    // Delay connection work to the next task so StrictMode probe cleanups and
    // same-tick room retargets can cancel before token fetch/socket setup begins.
    startTimer = setTimeout(() => {
      void startConnection()
    }, 0)

    return () => {
      cancelled = true
      if (startTimer) {
        clearTimeout(startTimer)
      }
    }
  }, [
    sessionId,
    roomId,
    tokenChannel,
    connect,
    disconnect,
    dualRoomHandoffEnabled,
    attemptDualRoomHandoff,
    invalidatePendingPublish,
    logConnectionStartDiag,
    teardownRoomListeners,
  ])

  useEffect(() => {
    if (!sessionId || !roomId) {
      return
    }

    return () => {
      if (typeof clearLiveKitConnection === 'function') {
        clearLiveKitConnection(connectionKey)
      }
    }
  }, [clearLiveKitConnection, connectionKey, roomId, sessionId])

  const effectiveConnectionState = sharedLiveKitState?.connectionState ?? connectionState
  const effectiveIsConnected = sharedLiveKitState?.isConnected ?? isConnected
  const effectiveIsConnecting = sharedLiveKitState?.isConnecting ?? isConnecting
  const effectiveError = sharedLiveKitState?.error ?? error

  return {
    connectionState: effectiveConnectionState,
    isConnected: effectiveIsConnected,
    isConnecting: effectiveIsConnecting,
    error: effectiveError,
    room,
    localAudioTrack,
    localInputTrack,
    localVideoTrack,
    remoteParticipants,
    publishAudio,
    unpublishAudio,
    disconnect,
  }
}
