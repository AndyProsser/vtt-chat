import { Icon } from '../ui/Icon'
import type { AudioDeviceState } from '@/types/audio'

interface AudioDevicePanelProps {
  device: AudioDeviceState
  isVoiceConnected: boolean
  onGoLive: () => void
  onMute: () => void
  onVolumeChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export function AudioDevicePanel({
  device,
  isVoiceConnected,
  onGoLive,
  onMute,
  onVolumeChange,
}: AudioDevicePanelProps) {
  return (
    <footer className="audio-panel__controls">
      <div className="audio-panel__buttons">
        {device.microphoneOn ? (
          <button
            onClick={onMute}
            className="audio-panel__control is-danger"
            title="Mute microphone"
            aria-label="Mute microphone"
          >
            <Icon name="mic" />
          </button>
        ) : (
          <button
            onClick={onGoLive}
            className="audio-panel__control is-success"
            title={isVoiceConnected ? 'Unmute microphone' : 'Connect voice first'}
            aria-label={isVoiceConnected ? 'Unmute microphone' : 'Connect voice first'}
            disabled={!isVoiceConnected}
          >
            <Icon name="mic" />
          </button>
        )}

        <button className="audio-panel__control" title="Audio settings" aria-label="Audio settings">
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
          onChange={onVolumeChange}
        />
      </label>
    </footer>
  )
}
