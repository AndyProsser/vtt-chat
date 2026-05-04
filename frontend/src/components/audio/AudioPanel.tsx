/**
 * AudioPanel
 * Audio and LiveKit integration surface.
 *
 * Composes useLiveKit + useAudioEngine into a single mounted component so that:
 *  - Remote tracks from LiveKit are piped into the WebAudio DSP graph.
 *  - Local mic publishing is gated on explicit user action (browser permission prompt
 *    is deferred until the user clicks "Go Live").
 *  - DM overrides, environment presets, and PTT state flow from the Zustand store
 *    into the audio engine automatically (handled inside useAudioEngine).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RoomEvent } from 'livekit-client'
import { Role } from '@shared'
import { useLiveKit } from '../../hooks/useLiveKit'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { useStore } from '../../hooks/useStore'
import { Icon } from '../ui/Icon'
import '../../styles/components/audio/AudioPanel.css'

interface AudioPanelProps {
  sessionId: string
  roomId: string
  role?: Role
}

const SPEAKING_ATTACK_MS = 80
const SPEAKING_RELEASE_MS = 180

function parseParticipantAudioMetadata(metadata: string | undefined): {
  muted?: boolean
  deafened?: boolean
} {
  if (!metadata) return {}

  try {
    const parsed = JSON.parse(metadata) as {
      muted?: boolean
      deafened?: boolean
      selfDeaf?: boolean
      audio?: { muted?: boolean; deafened?: boolean; selfDeaf?: boolean }
    }

    return {
      muted: parsed.audio?.muted ?? parsed.muted,
      deafened:
        parsed.audio?.deafened ?? parsed.audio?.selfDeaf ?? parsed.deafened ?? parsed.selfDeaf,
    }
  } catch {
    return {}
  }
}

export function AudioPanel({ sessionId, roomId, role }: AudioPanelProps) {
  const audioEngine = useAudioEngine()
  const [activeSpeakerSids, setActiveSpeakerSids] = useState<Set<string>>(() => new Set())
  const [smoothedSpeakerSids, setSmoothedSpeakerSids] = useState<Set<string>>(() => new Set())
  const speakerAttackTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const speakerReleaseTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const handleTrackSubscribed = useCallback(
    (trackSid: string, mediaStream: MediaStream) => {
      audioEngine.addTrack(`room:${trackSid}`, mediaStream)
    },
    [audioEngine]
  )

  const handleTrackUnsubscribed = useCallback(
    (trackSid: string) => {
      audioEngine.removeTrack(`room:${trackSid}`)
    },
    [audioEngine]
  )

  const handleBroadcastTrackSubscribed = useCallback(
    (trackSid: string, mediaStream: MediaStream) => {
      audioEngine.addTrack(`vog:${trackSid}`, mediaStream)
    },
    [audioEngine]
  )

  const handleBroadcastTrackUnsubscribed = useCallback(
    (trackSid: string) => {
      audioEngine.removeTrack(`vog:${trackSid}`)
    },
    [audioEngine]
  )

  const livekit = useLiveKit(sessionId, roomId, {
    onTrackSubscribed: handleTrackSubscribed,
    onTrackUnsubscribed: handleTrackUnsubscribed,
    tokenChannel: 'room',
  })

  const device = useStore((state) => state.device)
  const pttActive = useStore((state) => state.pttActive)
  const broadcastModeEnabled = useStore((state) => state.broadcastModeEnabled)
  const broadcastRoomIdFromState = useStore((state) => state.broadcastRoomId)
  const setDevice = useStore((state) => state.setDevice)
  const initializeAudio = useStore((state) => state.initializeAudio)
  const currentUser = useStore((state) => state.currentUser)
  const effectiveRole = role ?? currentUser?.role ?? Role.PLAYER

  const broadcastRoomId = broadcastRoomIdFromState || `dm-broadcast:${sessionId}`

  const broadcastLivekit = useLiveKit(sessionId, broadcastModeEnabled ? broadcastRoomId : '', {
    onTrackSubscribed: handleBroadcastTrackSubscribed,
    onTrackUnsubscribed: handleBroadcastTrackUnsubscribed,
    tokenChannel: 'broadcast',
  })

  const {
    isConnected: isBroadcastConnected,
    publishAudio: publishBroadcastAudio,
    unpublishAudio: unpublishBroadcastAudio,
  } = broadcastLivekit

  const handleGoLive = async () => {
    initializeAudio(true)
    await livekit.publishAudio()
    if (broadcastModeEnabled && effectiveRole === Role.DM) {
      try {
        await publishBroadcastAudio()
      } catch {
        // Broadcast channel publish can trail behind room publish while secondary channel connects.
      }
    }
    setDevice({ microphoneOn: true })
  }

  const handleMute = async () => {
    await livekit.unpublishAudio()
    await unpublishBroadcastAudio().catch(() => undefined)
    setDevice({ microphoneOn: false })
  }

  useEffect(() => {
    if (effectiveRole !== Role.DM) {
      return
    }

    if (!device.microphoneOn) {
      void unpublishBroadcastAudio().catch(() => undefined)
      return
    }

    if (broadcastModeEnabled && isBroadcastConnected) {
      void publishBroadcastAudio().catch(() => undefined)
    } else {
      void unpublishBroadcastAudio().catch(() => undefined)
    }
  }, [
    effectiveRole,
    device.microphoneOn,
    broadcastModeEnabled,
    isBroadcastConnected,
    publishBroadcastAudio,
    unpublishBroadcastAudio,
  ])

  useEffect(() => {
    if (device.microphoneOn && !device.enabled) {
      initializeAudio(true)
    }
  }, [device.enabled, device.microphoneOn, initializeAudio])

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value)
    setDevice({ volumeLevel: vol })
    audioEngine.setLocalGain(vol / 100)
  }

  const livekitRoomState = String(livekit.room?.state ?? '').toLowerCase()
  const roomReportsConnected = livekitRoomState === 'connected'
  const roomReportsConnecting =
    livekitRoomState === 'connecting' || livekitRoomState === 'reconnecting'

  const statusState =
    livekit.isConnected || roomReportsConnected
      ? 'connected'
      : livekit.isConnecting || roomReportsConnecting
        ? 'connecting'
        : 'disconnected'
  const isVoiceConnected = livekit.isConnected || roomReportsConnected
  const statusLabel = isVoiceConnected
    ? 'Connected'
    : livekit.isConnecting || roomReportsConnecting
      ? 'Connecting…'
      : 'Disconnected'

  useEffect(() => {
    const room = livekit.room
    if (!room) {
      return
    }

    const syncSpeakers = () => {
      const next = new Set(room.activeSpeakers.map((speaker) => speaker.sid))
      setActiveSpeakerSids(next)
    }

    syncSpeakers()
    room.on(RoomEvent.ActiveSpeakersChanged, syncSpeakers)

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, syncSpeakers)
    }
  }, [livekit.room])

  useEffect(() => {
    const attackTimers = speakerAttackTimersRef.current
    const releaseTimers = speakerReleaseTimersRef.current

    attackTimers.forEach((timer) => clearTimeout(timer))
    attackTimers.clear()

    releaseTimers.forEach((timer) => clearTimeout(timer))
    releaseTimers.clear()

    return () => {
      attackTimers.forEach((timer) => clearTimeout(timer))
      attackTimers.clear()

      releaseTimers.forEach((timer) => clearTimeout(timer))
      releaseTimers.clear()
    }
  }, [livekit.room])

  useEffect(() => {
    const remoteParticipants = Array.from(livekit.remoteParticipants.values())
    const validSids = new Set(remoteParticipants.map((participant) => participant.sid))
    const currentlySpeaking = new Set<string>()
    const attackTimers = speakerAttackTimersRef.current
    const releaseTimers = speakerReleaseTimersRef.current

    remoteParticipants.forEach((participant) => {
      if (participant.isSpeaking || activeSpeakerSids.has(participant.sid)) {
        currentlySpeaking.add(participant.sid)
      }
    })

    setSmoothedSpeakerSids((prev) => {
      const next = new Set(prev)

      // Speaking starts: cancel pending release and use a short attack delay.
      currentlySpeaking.forEach((sid) => {
        const existingRelease = releaseTimers.get(sid)
        if (existingRelease) {
          clearTimeout(existingRelease)
          releaseTimers.delete(sid)
        }

        if (next.has(sid) || attackTimers.has(sid)) {
          return
        }

        const attackTimer = setTimeout(() => {
          attackTimers.delete(sid)
          setSmoothedSpeakerSids((state) => {
            if (state.has(sid)) return state
            const updated = new Set(state)
            updated.add(sid)
            return updated
          })
        }, SPEAKING_ATTACK_MS)

        attackTimers.set(sid, attackTimer)
      })

      // Speaking stops: cancel pending attack and hold highlight briefly (release).
      prev.forEach((sid) => {
        if (currentlySpeaking.has(sid)) return

        const pendingAttack = attackTimers.get(sid)
        if (pendingAttack) {
          clearTimeout(pendingAttack)
          attackTimers.delete(sid)
        }

        if (!validSids.has(sid)) {
          next.delete(sid)
          const staleRelease = releaseTimers.get(sid)
          if (staleRelease) {
            clearTimeout(staleRelease)
            releaseTimers.delete(sid)
          }
          return
        }
        if (releaseTimers.has(sid)) return

        const releaseTimer = setTimeout(() => {
          releaseTimers.delete(sid)
          setSmoothedSpeakerSids((state) => {
            if (!state.has(sid)) return state
            const updated = new Set(state)
            updated.delete(sid)
            return updated
          })
        }, SPEAKING_RELEASE_MS)

        releaseTimers.set(sid, releaseTimer)
      })

      // Remove stale sids that no longer exist in participant map.
      next.forEach((sid) => {
        if (!validSids.has(sid)) {
          next.delete(sid)
          const staleAttack = attackTimers.get(sid)
          if (staleAttack) {
            clearTimeout(staleAttack)
            attackTimers.delete(sid)
          }
          const staleRelease = releaseTimers.get(sid)
          if (staleRelease) {
            clearTimeout(staleRelease)
            releaseTimers.delete(sid)
          }
        }
      })

      return next
    })
  }, [activeSpeakerSids, livekit.remoteParticipants])

  useEffect(() => {
    audioEngine.setLocalGain(device.volumeLevel / 100)
  }, [audioEngine, device.volumeLevel])

  const participants = useMemo(() => {
    const remote = Array.from(livekit.remoteParticipants.values()).map((participant) => {
      const metadataState = parseParticipantAudioMetadata(participant.metadata)
      const isMuted = metadataState.muted ?? !participant.isMicrophoneEnabled
      const isDeafened = metadataState.deafened ?? false

      return {
        id: participant.sid,
        name: participant.identity,
        isSelf: false,
        isSpeaking: smoothedSpeakerSids.has(participant.sid),
        isMuted,
        isDeafened,
      }
    })

    const selfName = currentUser?.username || 'You'
    const selfParticipant = {
      id: currentUser?.id ?? 'self',
      name: selfName,
      isSelf: true,
      isSpeaking: pttActive,
      isMuted: !device.microphoneOn,
      isDeafened: false,
    }

    return [selfParticipant, ...remote]
  }, [currentUser, device.microphoneOn, livekit.remoteParticipants, pttActive, smoothedSpeakerSids])

  const getInitials = (name: string): string => {
    const clean = name.trim()
    if (!clean) return 'U'
    const parts = clean.split(/\s+/)
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase()
    }
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
  }

  return (
    <section className="audio-panel border-t border-ui-border bg-ui-surface-subtle text-ui-primary">
      <header className="audio-panel__header">
        <span className="audio-panel__status">
          <span data-state={statusState} className="audio-panel__status-dot" />
          {statusLabel}
        </span>
        {livekit.error && <span className="audio-panel__error">⚠ {livekit.error}</span>}
      </header>

      <ul className="audio-panel__list" aria-label="Voice participants">
        {participants.map((participant) => (
          <li
            key={participant.id}
            className={`audio-panel__participant ${participant.isSpeaking ? 'is-speaking' : ''}`}
          >
            <span className="audio-panel__avatar" aria-hidden="true">
              {getInitials(participant.name)}
            </span>
            <span className="audio-panel__name">
              {participant.name}
              {participant.isSelf ? ' (you)' : ''}
            </span>
            <span className="audio-panel__badges">
              {participant.isMuted ? <span className="audio-panel__badge muted">Muted</span> : null}
              {participant.isDeafened ? (
                <span className="audio-panel__badge deafened">Deafened</span>
              ) : null}
              {participant.isSpeaking ? (
                <span className="audio-panel__badge speaking">Speaking</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <footer className="audio-panel__controls">
        <div className="audio-panel__buttons">
          {device.microphoneOn ? (
            <button
              onClick={handleMute}
              className="audio-panel__control is-danger"
              title="Mute microphone"
              aria-label="Mute microphone"
            >
              <Icon name="mic" />
            </button>
          ) : (
            <button
              onClick={handleGoLive}
              className="audio-panel__control is-success"
              title={isVoiceConnected ? 'Unmute microphone' : 'Connect voice first'}
              aria-label={isVoiceConnected ? 'Unmute microphone' : 'Connect voice first'}
              disabled={!isVoiceConnected}
            >
              <Icon name="mic" />
            </button>
          )}

          <button className="audio-panel__control" title="Audio settings">
            <Icon name="settings" />
          </button>
        </div>

        <label className="audio-panel__volume">
          <span>Vol</span>
          <input
            type="range"
            min={0}
            max={100}
            value={device.volumeLevel}
            onChange={handleVolumeChange}
          />
        </label>
      </footer>
    </section>
  )
}
