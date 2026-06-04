/**
 * DM Voice Presets — frontend re-export
 * The canonical definitions (including DSP parameters) live in shared/audio/voicePresets.ts.
 * This file re-exports them so frontend imports stay consistent with the rest of constants/.
 */
export {
  VOICE_PRESETS as DM_VOICE_PRESETS,
  findVoicePreset,
  VOICE_PRESET_NAMES,
} from '@shared'

export type { VoicePreset as DmVoicePreset, VoicePresetDsp } from '@shared'
