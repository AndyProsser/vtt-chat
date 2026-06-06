/**
 * Audio preset re-exports for the frontend.
 * Canonical definitions (including DSP parameters) live in shared/audio/audioPresets.ts.
 */
export {
  VOICE_PRESETS as DM_VOICE_PRESETS,
  ENVIRONMENT_PRESETS as DM_ENVIRONMENT_PRESETS,
  DISTANCE_PRESETS as DM_DISTANCE_PRESETS,
  CONDITION_PRESETS as DM_CONDITION_PRESETS,
  findVoicePreset,
  findEnvironmentPreset,
  findDistancePreset,
  findConditionPreset,
  VOICE_PRESET_NAMES,
  ENVIRONMENT_PRESET_NAMES,
  DISTANCE_PRESET_NAMES,
  CONDITION_PRESET_NAMES,
} from '@shared'

export type {
  VoicePreset as DmVoicePreset,
  VoicePresetDsp,
  EnvironmentPreset as DmEnvironmentPreset,
  EnvironmentPresetDsp,
  DistancePreset as DmDistancePreset,
  DistancePresetDsp,
  ConditionPreset as DmConditionPreset,
  ConditionPresetDsp,
} from '@shared'
