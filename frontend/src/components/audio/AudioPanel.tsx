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
import { useLiveKit } from '../../hooks/useLiveKit'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { useStore } from '../../hooks/useStore'
import { Icon } from '../ui/Icon'
import '../../styles/components/audio/AudioPanel.css'

interface AudioPanelProps {
  sessionId: string
  roomId: string
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

export function AudioPanel({ sessionId, roomId }: AudioPanelProps) {
  const audioEngine = useAudioEngine()
  const [deafened, setDeafened] = useState(false)
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

  const handleVoiceOfGodTrackSubscribed = useCallback(
    (trackSid: string, mediaStream: MediaStream) => {
      audioEngine.addTrack(`vog:${trackSid}`, mediaStream)
    },
    [audioEngine]
  )

  const handleVoiceOfGodTrackUnsubscribed = useCallback(
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
  const voiceOfGodEnabled = useStore((state) => state.voiceOfGodEnabled)
  const voiceOfGodRoomIdFromState = useStore((state) => state.voiceOfGodRoomId)
  const setDevice = useStore((state) => state.setDevice)
  const togglePTT = useStore((state) => state.togglePTT)
  const initializeAudio = useStore((state) => state.initializeAudio)
  const currentUser = useStore((state) => state.currentUser)

  const voiceOfGodRoomId = voiceOfGodRoomIdFromState || `voice-of-god:${sessionId}`

  const voiceOfGodLivekit = useLiveKit(sessionId, voiceOfGodEnabled ? voiceOfGodRoomId : '', {
    onTrackSubscribed: handleVoiceOfGodTrackSubscribed,
    onTrackUnsubscribed: handleVoiceOfGodTrackUnsubscribed,
    tokenChannel: 'voice_of_god',
  })

  const handleGoLive = async () => {
    initializeAudio(true)
    await livekit.publishAudio()
    if (voiceOfGodEnabled && currentUser?.role === 'DM') {
      try {
        await voiceOfGodLivekit.publishAudio()
      } catch {
        // Voice of God publish can trail behind room publish while secondary channel connects.
      }
    }
    setDevice({ microphoneOn: true })
  }

  const handleMute = async () => {
    await livekit.unpublishAudio()
    await voiceOfGodLivekit.unpublishAudio().catch(() => undefined)
    setDevice({ microphoneOn: false })
  }

  useEffect(() => {
    if (currentUser?.role !== 'DM') {
      return
    }

    if (!device.microphoneOn) {
      void voiceOfGodLivekit.unpublishAudio().catch(() => undefined)
      return
    }

    if (voiceOfGodEnabled && voiceOfGodLivekit.isConnected) {
      void voiceOfGodLivekit.publishAudio().catch(() => undefined)
    } else {
      void voiceOfGodLivekit.unpublishAudio().catch(() => undefined)
    }
  }, [
    currentUser?.role,
    device.microphoneOn,
    voiceOfGodEnabled,
    voiceOfGodLivekit.isConnected,
    voiceOfGodLivekit.publishAudio,
    voiceOfGodLivekit.unpublishAudio,
  ])

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value)
    setDevice({ volumeLevel: vol })
    if (!deafened) {
      audioEngine.setLocalGain(vol / 100)
    }
  }

  const statusState = livekit.isConnected
    ? 'connected'
    : livekit.isConnecting
      ? 'connecting'
      : 'disconnected'
  const statusLabel = livekit.isConnected
    ? 'Connected'
    : livekit.isConnecting
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
    if (!livekit.isConnected || !deafened) {
      audioEngine.setLocalGain(device.volumeLevel / 100)
      return
    }

    audioEngine.setLocalGain(0)
  }, [audioEngine, deafened, device.volumeLevel, livekit.isConnected])

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
      isDeafened: deafened,
    }

    return [selfParticipant, ...remote]
  }, [
    currentUser,
    deafened,
    device.microphoneOn,
    livekit.remoteParticipants,
    pttActive,
    smoothedSpeakerSids,
  ])

  const selfLabel = currentUser?.username || 'You'

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
        <div className="audio-panel__self">
          <span className="audio-panel__avatar" aria-hidden="true">
            {getInitials(selfLabel)}
          </span>
          <div className="audio-panel__self-meta">
            <strong>{selfLabel}</strong>
            <span>
              {deafened ? 'Output deafened' : device.microphoneOn ? 'Mic active' : 'Mic muted'}
            </span>
          </div>
        </div>

        <div className="audio-panel__buttons">
          {livekit.isConnected && device.microphoneOn ? (
            <button onClick={handleMute} className="audio-panel__control is-danger" title="Mute">
              <Icon name="mic" />
            </button>
          ) : (
            <button
              onClick={handleGoLive}
              className="audio-panel__control is-success"
              title="Go live"
            >
              <Icon name="mic" />
            </button>
          )}

          <button
            onClick={() => setDeafened((prev) => !prev)}
            className={`audio-panel__control ${deafened ? 'is-active' : ''}`}
            title="Deafen"
          >
            <Icon name="voice" />
          </button>

          <button
            onMouseDown={() => togglePTT(true)}
            onMouseUp={() => togglePTT(false)}
            onMouseLeave={() => togglePTT(false)}
            className={`audio-panel__control ${pttActive ? 'is-active' : ''}`}
            disabled={!livekit.isConnected || !device.microphoneOn}
            title="Push to talk"
          >
            PTT
          </button>

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
