/**
 * Baseline placeholder module.
 * This implementation is intentionally disabled for staged rebuild.
 */
/**
 * AudioPanel
 * Stage 7: Audio & LiveKit integration surface.
 *
 * Composes useLiveKit + useAudioEngine into a single mounted component so that:
 *  - Remote tracks from LiveKit are piped into the WebAudio DSP graph.
 *  - Local mic publishing is gated on explicit user action (browser permission prompt
 *    is deferred until the user clicks "Go Live").
 *  - DM overrides, environment presets, and PTT state flow from the Zustand store
 *    into the audio engine automatically (handled inside useAudioEngine).
 */

import { useCallback } from 'react'
import { useLiveKit } from '../../hooks/useLiveKit'
import { useAudioEngine } from '../../hooks/useAudioEngine'
import { useStore } from '../../hooks/useStore'

interface AudioPanelProps {
  sessionId: string
  roomId: string
}

export function AudioPanel({ sessionId, roomId }: AudioPanelProps) {
  const audioEngine = useAudioEngine()

  const handleTrackSubscribed = useCallback(
    (trackSid: string, mediaStream: MediaStream) => {
      audioEngine.addTrack(trackSid, mediaStream)
    },
    [audioEngine]
  )

  const handleTrackUnsubscribed = useCallback(
    (trackSid: string) => {
      audioEngine.removeTrack(trackSid)
    },
    [audioEngine]
  )

  const livekit = useLiveKit(sessionId, roomId, {
    onTrackSubscribed: handleTrackSubscribed,
    onTrackUnsubscribed: handleTrackUnsubscribed,
  })

  const { device, pttActive, setDevice, togglePTT, initializeAudio } = useStore((s) => ({
    device: s.device,
    pttActive: s.pttActive,
    setDevice: s.setDevice,
    togglePTT: s.togglePTT,
    initializeAudio: s.initializeAudio,
  }))

  const handleGoLive = async () => {
    initializeAudio(true)
    await livekit.publishAudio()
    setDevice({ microphoneOn: true })
  }

  const handleMute = async () => {
    await livekit.unpublishAudio()
    setDevice({ microphoneOn: false })
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value)
    setDevice({ volumeLevel: vol })
    audioEngine.setLocalGain(vol / 100)
  }

  const statusColor = livekit.isConnected ? '#22c55e' : livekit.isConnecting ? '#f59e0b' : '#6b7280'
  const statusLabel = livekit.isConnected
    ? 'Connected'
    : livekit.isConnecting
      ? 'Connecting…'
      : 'Disconnected'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 1rem',
        backgroundColor: '#1f2937',
        borderTop: '1px solid #374151',
        fontSize: '0.875rem',
        color: '#f9fafb',
      }}
    >
      {/* Connection status */}
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: statusColor,
            display: 'inline-block',
          }}
        />
        {statusLabel}
      </span>

      {/* Error */}
      {livekit.error && (
        <span style={{ color: '#f87171', marginLeft: '0.5rem' }}>⚠ {livekit.error}</span>
      )}

      <span style={{ flex: 1 }} />

      {/* Volume */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        🔊
        <input
          type="range"
          min={0}
          max={100}
          value={device.volumeLevel}
          onChange={handleVolumeChange}
          style={{ width: '80px', accentColor: '#6366f1' }}
        />
      </label>

      {/* PTT */}
      {livekit.isConnected && device.microphoneOn && (
        <button
          onMouseDown={() => togglePTT(true)}
          onMouseUp={() => togglePTT(false)}
          onMouseLeave={() => togglePTT(false)}
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: pttActive ? '#4f46e5' : '#374151',
            color: '#f9fafb',
            cursor: 'pointer',
            fontWeight: pttActive ? '700' : '400',
          }}
        >
          PTT
        </button>
      )}

      {/* Mic toggle */}
      {livekit.isConnected &&
        (device.microphoneOn ? (
          <button
            onClick={handleMute}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#dc2626',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            🎙 Mute
          </button>
        ) : (
          <button
            onClick={handleGoLive}
            style={{
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#16a34a',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            🎙 Go Live
          </button>
        ))}
    </div>
  )
}
