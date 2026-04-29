export type AudioConnectionState = 'disconnected' | 'connecting' | 'connected'

export interface AudioDeviceState {
  microphoneOn: boolean
  volumeLevel: number
  noiseSuppression: boolean
  echoCancellation: boolean
}

export interface AudioRoomPreset {
  id: string
  label: string
  gain: number
  reverb: number
  lowPassHz: number
}

export interface DMVoiceOverrideState {
  enabled: boolean
  gain: number
  muted: boolean
}
