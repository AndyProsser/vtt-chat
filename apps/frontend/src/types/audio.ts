import type { UUID } from '@shared'

export type AudioConnectionState = 'disconnected' | 'connecting' | 'connected'

export interface AudioDeviceState {
  /** Audio enabled (device permission granted) */
  enabled: boolean
  /** Microphone active (publishing audio) */
  microphoneOn: boolean
  /** Microphone gain (0–100) */
  micGain: number
  /** Master volume (0–100) */
  volumeLevel: number
  /** DM background room audio level (0–100, device-local) */
  backgroundAudioLevel: number
  /** Currently speaking (VAD detection) */
  isSpeaking: boolean
  selectedMicDeviceId?: string
  selectedSpeakerDeviceId?: string
  /** Push-to-talk mode enabled */
  pttEnabled: boolean
  /** Browser auto gain control enabled */
  autoGainEnabled: boolean
  /** Noise suppression level */
  noiseFilterLevel: 'auto' | 'low' | 'medium' | 'high'
}

export interface EnvironmentPreset {
  id: UUID
  name: string
  reverbSend: number
  lowpassFreq: number
  roomGain: number
  description?: string
}

export interface DistancePreset {
  id: UUID
  name: string
  lowpassFreq: number
  gainReduction: number
  reverbSend: number
}

export interface ConditionPreset {
  id: UUID
  name: string
  effects: Record<string, unknown>
}

export interface VoicePreset {
  id: UUID
  name: string
  pitchShift: number
  formantShift: number
  distortion?: number
  dryWet?: number
}

export interface ICPreset {
  id: UUID
  name: string
  effects: Record<string, unknown>
}

export interface AudioDMOverride {
  userId: UUID
  overrideType:
    | 'MUTE'
    | 'UNMUTE'
    | 'GAIN'
    | 'GATE'
    | 'FILTER'
    | 'DISTANCE'
    | 'CONDITION'
    | 'VOICE'
    | 'VOICE_OF_GOD'
  parameters?: Record<string, unknown>
  appliedAt: number
}
