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
