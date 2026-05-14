export const AUDIO_BROADCAST_OVERRIDE_TYPE = 'VOICE_OF_GOD'

export const AUDIO_DM_OVERRIDE_TYPES = {
  MUTE: 'MUTE',
  UNMUTE: 'UNMUTE',
  GAIN: 'GAIN',
  GATE: 'GATE',
  FILTER: 'FILTER',
} as const

export type AudioDMOverrideType =
  (typeof AUDIO_DM_OVERRIDE_TYPES)[keyof typeof AUDIO_DM_OVERRIDE_TYPES]

export type AudioPresetCategory = 'VOICE' | 'DISTANCE' | 'ENVIRONMENT' | 'CONDITION' | 'IC'

export type AudioPreset = {
  id: string
  name: string
  category: AudioPresetCategory
}

export const AUDIO_PRESETS: AudioPreset[] = [
  { id: 'voice-narrator', name: 'Narrator', category: 'VOICE' },
  { id: 'voice-whisper', name: 'Whisper', category: 'VOICE' },
  { id: 'distance-near', name: 'Near', category: 'DISTANCE' },
  { id: 'distance-far', name: 'Far', category: 'DISTANCE' },
  { id: 'env-tavern', name: 'Tavern', category: 'ENVIRONMENT' },
  { id: 'env-cave', name: 'Cave', category: 'ENVIRONMENT' },
  { id: 'cond-silenced', name: 'Silenced', category: 'CONDITION' },
  { id: 'ic-goblin', name: 'Goblin', category: 'IC' },
]

export const AUDIO_EVENT_TYPES = {
  ENVIRONMENT_SET: 'AUDIO:ENVIRONMENT_SET',
  DM_OVERRIDE_APPLIED: 'AUDIO:DM_OVERRIDE_APPLIED',
  DM_OVERRIDE_REMOVED: 'AUDIO:DM_OVERRIDE_REMOVED',
  BROADCAST_STATE_CHANGED: 'AUDIO:BROADCAST_STATE_CHANGED',
} as const
