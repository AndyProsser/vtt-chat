import { VOICE_PRESETS, VOICE_PRESET_NAMES } from '@shared'

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

/**
 * Voice presets available for DM mic processing.
 * Canonical definitions (including DSP params) live in shared/audio/voicePresets.ts.
 * Backend uses these for validation only; DSP is applied client-side.
 */
export { VOICE_PRESETS as AUDIO_VOICE_PRESETS, VOICE_PRESET_NAMES as AUDIO_VOICE_PRESET_NAMES }

/** Legacy preset catalogue kept for API compatibility. Points to voice presets for VOICE category. */
export const AUDIO_PRESETS = VOICE_PRESETS.map((p) => ({
  id: `voice-${p.name.toLowerCase().replace(/\s+/g, '-')}`,
  name: p.name,
  category: 'VOICE' as const,
}))

export const AUDIO_EVENT_TYPES = {
  ENVIRONMENT_SET: 'AUDIO:ENVIRONMENT_SET',
  DM_OVERRIDE_APPLIED: 'AUDIO:DM_OVERRIDE_APPLIED',
  DM_OVERRIDE_REMOVED: 'AUDIO:DM_OVERRIDE_REMOVED',
  BROADCAST_STATE_CHANGED: 'AUDIO:BROADCAST_STATE_CHANGED',
  DM_VOICE_TARGET_CHANGED: 'AUDIO:DM_VOICE_TARGET_CHANGED',
  DM_VOICE_MODE_CHANGED: 'AUDIO:DM_VOICE_MODE_CHANGED',
} as const
