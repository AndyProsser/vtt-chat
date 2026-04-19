/**
 * useLiveKit Hook
 * Manages LiveKit room connection, token exchange, and track lifecycle.
 *
 * Reference: docs/architecture/LIVEKIT-INTEGRATION.md
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Room,
  RoomEvent,
  RemoteAudioTrack,
  RemoteVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
} from 'livekit-client'
import { useStore } from './useStore'
import { logger } from '@/utils/logger'

/**
 * Track subscription info
 */
interface TrackSubscription {
  participantId: string
  trackSid: string
  trackName: string
  trackKind: 'audio' | 'video'
}

/**
 * Room connection state
 */
export interface UseLiveKitReturn {
  isConnected: boolean
  isConnecting: boolean
  error?: string
  room?: Room
  localAudioTrack?: LocalAudioTrack
  localVideoTrack?: LocalVideoTrack
  remoteParticipants: Map<string, any>
  publishAudio: () => Promise<void>
  unpublishAudio: () => Promise<void>
  disconnect: () => Promise<void>
}

export function useLiveKit(sessionId: string, roomId: string): UseLiveKitReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string>()
  const [remoteParticipants, setRemoteParticipants] = useState(new Map())

  const roomRef = useRef<Room>()
  const localAudioRef = useRef<LocalAudioTrack>()
  const localVideoRef = useRef<LocalVideoTrack>()
  const trackSubscriptionsRef = useRef<TrackSubscription[]>([])

  const { user } = useStore((state) => ({
    user: state.auth.user,
  }))

  /**
   * Fetch LiveKit token from backend
   */
  const fetchToken = useCallback(async (): Promise<{ token: string; url: string } | null> => {
    try {
      const response = await fetch('/api/livekit/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({ sessionId, roomId }),
      })

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.statusText}`)
      }

      const data = await response.json()
      return { token: data.token, url: data.url }
    } catch (err) {
      logger.error(
        'useLiveKit',
        `Token fetch failed: ${err instanceof Error ? err.message : String(err)}`
      )
      throw err
    }
  }, [sessionId, roomId])

  /**
   * Connect to LiveKit room
   */
  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return

    setIsConnecting(true)
    setError(undefined)

    try {
      const tokenData = await fetchToken()
      if (!tokenData) {
        throw new Error('Failed to fetch LiveKit token')
      }

      const room = new Room({
        autoSubscribe: true,
      })

      // Event handlers
      room.on(RoomEvent.Connected, () => {
        logger.info('useLiveKit', `Connected to room ${roomId}`)
        setIsConnected(true)
        setIsConnecting(false)
      })

      room.on(RoomEvent.Disconnected, () => {
        logger.info('useLiveKit', `Disconnected from room ${roomId}`)
        setIsConnected(false)
      })

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        logger.info('useLiveKit', `Participant connected: ${participant.identity}`)
        setRemoteParticipants((prev) => new Map(prev).set(participant.sid, participant))
      })

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        logger.info('useLiveKit', `Participant disconnected: ${participant.identity}`)
        setRemoteParticipants((prev) => {
          const updated = new Map(prev)
          updated.delete(participant.sid)
          return updated
        })
      })

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        logger.info('useLiveKit', `Track subscribed: ${track.kind} from ${participant.identity}`)
        trackSubscriptionsRef.current.push({
          participantId: participant.sid,
          trackSid: track.sid,
          trackName: track.name,
          trackKind: track.kind as 'audio' | 'video',
        })

        if (track.kind === 'audio') {
          // Audio track will be processed by useAudioEngine
          const audioElement = document.createElement('audio')
          audioElement.autoplay = true
          audioElement.playsInline = true
          audioElement.append(track.attach())
        }
      })

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        logger.info('useLiveKit', `Track unsubscribed: ${track.kind}`)
        trackSubscriptionsRef.current = trackSubscriptionsRef.current.filter(
          (t) => t.trackSid !== track.sid
        )
        track.detach()
      })

      // Connect to room
      await room.connect(tokenData.url, tokenData.token)

      roomRef.current = room
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('useLiveKit', `Connection failed: ${errorMsg}`)
      setError(errorMsg)
      setIsConnecting(false)
    }
  }, [fetchToken, isConnecting, isConnected, roomId])

  /**
   * Publish local audio track
   */
  const publishAudio = useCallback(async () => {
    if (!roomRef.current) {
      throw new Error('Room not connected')
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      const audioTrack = new LocalAudioTrack(stream.getAudioTracks()[0])

      await roomRef.current.localParticipant.publishTrack(audioTrack, {
        codec: 'opus',
        maxBitrate: 128000,
      })
      localAudioRef.current = audioTrack

      logger.info('useLiveKit', 'Audio track published')
    } catch (err) {
      logger.error(
        'useLiveKit',
        `Audio publish failed: ${err instanceof Error ? err.message : String(err)}`
      )
      throw err
    }
  }, [])

  /**
   * Unpublish local audio track
   */
  const unpublishAudio = useCallback(async () => {
    if (localAudioRef.current && roomRef.current) {
      await roomRef.current.localParticipant.unpublishTrack(localAudioRef.current)
      localAudioRef.current = undefined
      logger.info('useLiveKit', 'Audio track unpublished')
    }
  }, [])

  /**
   * Disconnect from room
   */
  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect()
      roomRef.current = undefined
      localAudioRef.current = undefined
      localVideoRef.current = undefined
      trackSubscriptionsRef.current = []
      setIsConnected(false)
      logger.info('useLiveKit', 'Disconnected from room')
    }
  }, [])

  /**
   * Initialize connection on mount
   */
  useEffect(() => {
    if (sessionId && roomId && user) {
      void connect()
    }

    return () => {
      void disconnect()
    }
  }, [sessionId, roomId, user, connect, disconnect])

  return {
    isConnected,
    isConnecting,
    error,
    room: roomRef.current,
    localAudioTrack: localAudioRef.current,
    localVideoTrack: localVideoRef.current,
    remoteParticipants,
    publishAudio,
    unpublishAudio,
    disconnect,
  }
}
