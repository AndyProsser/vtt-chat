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
    <div className="flex items-center gap-3 border-t border-ui-border bg-ui-surface-subtle px-4 py-2 text-sm text-ui-primary">
      {/* Connection status */}
      <span className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
        {statusLabel}
      </span>

      {/* Error */}
      {livekit.error && <span className="ml-2 text-ui-error-text">⚠ {livekit.error}</span>}

      <span className="flex-1" />

      {/* Volume */}
      <label className="flex items-center gap-2">
        🔊
        <input
          type="range"
          min={0}
          max={100}
          value={device.volumeLevel}
          onChange={handleVolumeChange}
          className="w-20 accent-sky-600"
        />
      </label>

      {/* PTT */}
      {livekit.isConnected && device.microphoneOn && (
        <button
          onMouseDown={() => togglePTT(true)}
          onMouseUp={() => togglePTT(false)}
          onMouseLeave={() => togglePTT(false)}
          className={`rounded-ui-sm px-3 py-1 text-white ${
            pttActive ? 'bg-indigo-600 font-bold' : 'bg-slate-600'
          }`}
        >
          PTT
        </button>
      )}

      {/* Mic toggle */}
      {livekit.isConnected &&
        (device.microphoneOn ? (
          <button onClick={handleMute} className="rounded-ui-sm bg-red-600 px-3 py-1 text-white">
            🎙 Mute
          </button>
        ) : (
          <button
            onClick={handleGoLive}
            className="rounded-ui-sm bg-emerald-600 px-3 py-1 text-white"
          >
            🎙 Go Live
          </button>
        ))}
    </div>
  )
}
