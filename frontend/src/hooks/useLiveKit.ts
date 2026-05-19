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
  const { onTrackSubscribed, onTrackUnsubscribed, tokenChannel = 'room' } = options
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

  const roomRef = useRef<Room | null>(null)
  const localAudioRef = useRef<LocalAudioTrack | null>(null)
  const localVideoRef = useRef<LocalVideoTrack | null>(null)
  const isMountedRef = useRef(true)
  const isConnectingRef = useRef(false)
  const connectingTargetRef = useRef<string | null>(null)
  const connectionAttemptRef = useRef(0)
  const connectionKeyRef = useRef<string | null>(null)
  const hasLocalPublicationRef = useRef(false)
  const trackSubscriptionsRef = useRef<TrackSubscription[]>([])
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

  useEffect(() => {
    // StrictMode runs effect cleanup probes in dev; reset mounted flag on each setup.
    isMountedRef.current = true

    return () => {
      // Unmount cleanup: tear down media/room without relying on state setters.
      connectionAttemptRef.current += 1
      isConnectingRef.current = false
      connectingTargetRef.current = null

      const activeAudioTrack = localAudioRef.current
      if (activeAudioTrack) {
        activeAudioTrack.stop()
      }

      const activeRoom = roomRef.current
      roomRef.current = null
      connectionKeyRef.current = null

      if (activeRoom) {
        void activeRoom.disconnect()
      }

      const clearLocalInputTrack = setLiveKitLocalInputTrackRef.current
      if (typeof clearLocalInputTrack === 'function') {
        clearLocalInputTrack(cleanupConnectionKeyRef.current, null)
      }

      isMountedRef.current = false
    }
  }, [])

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

      if (typeof data.url === 'string' && isLoopbackLiveKitUrl(data.url)) {
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

      // Event handlers
      nextRoom.on(RoomEvent.Connected, () => {
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
      })

      const syncConnectionFlags = () => {
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

      nextRoom.on(RoomEvent.ConnectionStateChanged, syncConnectionFlags)
      nextRoom.on(RoomEvent.Reconnecting, syncConnectionFlags)
      nextRoom.on(RoomEvent.SignalReconnecting, syncConnectionFlags)
      nextRoom.on(RoomEvent.Reconnected, syncConnectionFlags)

      nextRoom.on(RoomEvent.Disconnected, () => {
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
      })

      nextRoom.on(RoomEvent.LocalTrackPublished, () => {
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
      })

      nextRoom.on(RoomEvent.LocalTrackUnpublished, () => {
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
      })

      nextRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        if (roomRef.current !== nextRoom || !isMountedRef.current) {
          return
        }

        logger.info('useLiveKit', `Participant connected: ${participant.identity}`)
        setRemoteParticipants((prev) => new Map(prev).set(participant.sid, participant))
      })

      nextRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (roomRef.current !== nextRoom || !isMountedRef.current) {
          return
        }

        logger.info('useLiveKit', `Participant disconnected: ${participant.identity}`)
        setRemoteParticipants((prev) => {
          const updated = new Map(prev)
          updated.delete(participant.sid)
          return updated
        })
      })

      nextRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
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
      })

      nextRoom.on(RoomEvent.TrackUnsubscribed, (track, publication) => {
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
      })

      // Connect to room
      await nextRoom.connect(tokenData.url, tokenData.token, {
        autoSubscribe: true,
      })

      syncConnectionFlags()

      if (roomRef.current !== nextRoom || connectionAttemptRef.current !== attemptId) {
        await nextRoom.disconnect()
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
      const expectedDisconnect = isExpectedDisconnectError(err)

      if (nextRoom && roomRef.current === nextRoom) {
        roomRef.current = null
      }
      setRoomState(null)

      if (nextRoom) {
        try {
          await nextRoom.disconnect()
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
    fetchToken,
    getHasLocalPublication,
    isExpectedDisconnectError,
    publishConnectionSnapshot,
    roomId,
    sessionId,
    setRoomState,
    tokenChannel,
  ])

  /**
   * Publish the local microphone to the active room.
   */
  const publishAudio = useCallback(async () => {
    const activeRoom = roomRef.current
    if (!activeRoom) {
      throw new Error('Room not connected')
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getLocalAudioConstraints(),
      })

      const inputTrack = stream.getAudioTracks()[0]

      const audioTrack = new LocalAudioTrack(inputTrack)
      await activeRoom.localParticipant.publishTrack(audioTrack, {
        audioPreset: { ...AudioPresets.music, maxBitrate: 128000 },
      })

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
      const message = err instanceof Error ? err.message : String(err)
      const isPermissionError = /insufficient permissions|not authorized|permission/i.test(message)

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
  }, [
    connect,
    connectionKey,
    getHasLocalPublication,
    getLocalAudioConstraints,
    publishConnectionSnapshot,
    setLiveKitLocalInputTrack,
    setLocalAudioTrackState,
    setRoomState,
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

    const activeRoom = roomRef.current
    const activeAudioTrack = localAudioRef.current

    if (activeAudioTrack) {
      activeAudioTrack.stop()
    }

    if (activeRoom) {
      try {
        await activeRoom.disconnect()
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
  ])

  /**
   * Start a connection when session, room, and user context are all present.
   */
  useEffect(() => {
    if (!sessionId || !roomId) {
      if (roomRef.current || isConnectingRef.current || localAudioRef.current) {
        void disconnect()
      }
      return
    }

    let cancelled = false
    const targetConnectionKey = `${sessionId}:${roomId}:${tokenChannel}`

    const startConnection = async () => {
      await Promise.resolve()
      if (cancelled) {
        return
      }

      // If room target changed, replace stale connection work before connecting.
      const hasStaleConnectedRoom =
        Boolean(roomRef.current) && connectionKeyRef.current !== targetConnectionKey
      const hasStaleInFlightRoom =
        isConnectingRef.current && connectingTargetRef.current !== targetConnectionKey

      if (hasStaleConnectedRoom) {
        await disconnect()
      } else if (hasStaleInFlightRoom) {
        // Avoid disconnecting while offer negotiation is in-flight; invalidate and replace.
        connectionAttemptRef.current += 1
        isConnectingRef.current = false
        connectingTargetRef.current = null
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
        await connect()
      }
    }

    void startConnection()

    return () => {
      cancelled = true
    }
  }, [sessionId, roomId, tokenChannel, connect, disconnect])

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
