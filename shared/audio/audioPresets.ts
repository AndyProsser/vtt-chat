/**
 * Audio Presets — Canonical Definitions
 *
 * Single source of truth for all audio preset categories used across backend
 * and frontend. Every preset includes DSP parameters that map directly to
 * Web Audio API nodes — no name→DSP translation scattered across the codebase.
 *
 * Categories:
 *   VOICE       — DM mic chain (client-side via LocalAudioTrack.replaceTrack)
 *   ENVIRONMENT — Room-level acoustics for ALL players in a group (incoming tracks)
 *   DISTANCE    — Per-player spatial attenuation (how far away a player sounds)
 *   CONDITION   — Per-player state effects (Silenced, Drunk, Underwater, etc.)
 *
 * DSP signal paths:
 *   Voice:       mic → EQ → distortion? → compressor? → reverb blend → LiveKit
 *   Environment: incomingTrack → lowpass → effectsSend → reverb → roomGainBus
 *   Distance:    incomingTrack → lowpass → gainReduction → effectsSend
 *   Condition:   incomingTrack → lowpass? → gain? → mute?
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shared DSP primitives
// ─────────────────────────────────────────────────────────────────────────────

export interface EqShelf {
  frequency: number
  gainDb: number
}

export interface EqBand {
  frequency: number
  Q: number
  gainDb: number
}

export interface BqFilter {
  frequency: number
  Q: number
}

export interface Compressor {
  /** dB threshold below which no compression is applied */
  threshold: number
  /** dB of smooth transition range */
  knee: number
  /** Compression ratio, e.g. 4 = 4:1 */
  ratio: number
  attack: number
  release: number
}

// ─────────────────────────────────────────────────────────────────────────────
// VOICE — DM mic processing
// ─────────────────────────────────────────────────────────────────────────────

export interface VoicePresetDsp {
  inputGain: number
  highpass?: BqFilter
  lowpass?: BqFilter
  lowShelf?: EqShelf
  highShelf?: EqShelf
  peak?: EqBand
  /** Soft-clip waveshaper intensity (0 = off, 1 = extreme crunch). */
  distortion?: number
  compression?: Compressor | null
  /** Wet/dry ratio for the synthetic reverb send (0–1). */
  reverbWet: number
  /** Decay time for the synthetic impulse reverb in seconds. */
  reverbDecaySeconds: number
  outputGain: number
}

export interface VoicePreset {
  name: string
  label: string
  description: string
  icon: string
  dsp: VoicePresetDsp
}

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT — Room-level acoustics (all players in a group)
// ─────────────────────────────────────────────────────────────────────────────

export interface EnvironmentPresetDsp {
  /**
   * Lowpass filter on incoming tracks (Hz).
   * 8000 = neutral. Lower = more muffled.
   */
  lowpassFreq: number
  /** Reverb send level (0–1). dry = 1 - reverbSend, wet = reverbSend. */
  reverbSend: number
  /** Synthetic reverb decay in seconds. Longer = larger space. */
  reverbDecaySeconds: number
  /**
   * Master level trim for this environment in dB.
   * Positive = louder; negative = quieter (e.g. storm makes voices harder to hear).
   */
  roomGainDb: number
}

export interface EnvironmentPreset {
  name: string
  label: string
  description: string
  icon: string
  dsp: EnvironmentPresetDsp
}

// ─────────────────────────────────────────────────────────────────────────────
// DISTANCE — Per-player spatial attenuation
// ─────────────────────────────────────────────────────────────────────────────

export interface DistancePresetDsp {
  /**
   * Lowpass filter cutoff (Hz). Simulates air absorption.
   * Lower = farther / more muffled.
   */
  lowpassFreq: number
  /** Gain reduction in dB (positive value = quieter). Applied after the distance filter. */
  gainReduction: number
  /** Reverb send (0–1). Adds diffuse room reverb as distance increases. */
  reverbSend: number
}

export interface DistancePreset {
  name: string
  label: string
  description: string
  icon: string
  dsp: DistancePresetDsp
}

// ─────────────────────────────────────────────────────────────────────────────
// CONDITION — Per-player state effects
// ─────────────────────────────────────────────────────────────────────────────

export interface ConditionPresetDsp {
  /** Lowpass filter cutoff (Hz). 8000 = no filtering. Muffles voice. */
  lowpassFreq?: number
  /** Track gain multiplier (0–1). 0 = silent, 1 = unity. */
  gain?: number
  /** Forces track gain to 0. Takes precedence over gain. */
  muted?: boolean
  /**
   * Reverb send (0–1). Used for underwater / phantom / spatial conditions
   * where sound seems to come from everywhere.
   */
  reverbSend?: number
}

export interface ConditionPreset {
  name: string
  label: string
  description: string
  icon: string
  dsp: ConditionPresetDsp
}

// ─────────────────────────────────────────────────────────────────────────────
// Compression helpers (shared across voice presets)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_COMP: Compressor = {
  threshold: -24,
  knee: 8,
  ratio: 4,
  attack: 0.003,
  release: 0.25,
}

const HEAVY_COMP: Compressor = {
  threshold: -18,
  knee: 4,
  ratio: 8,
  attack: 0.001,
  release: 0.1,
}

// ═════════════════════════════════════════════════════════════════════════════
// VOICE PRESET CATALOGUE
// ═════════════════════════════════════════════════════════════════════════════

export const VOICE_PRESETS: VoicePreset[] = [
  {
    name: 'Narrator',
    label: 'Narrator',
    description: 'Warm, theatrical storytelling voice',
    icon: 'menu_book',
    dsp: {
      inputGain: 1.0,
      lowShelf: { frequency: 200, gainDb: 2 },
      highShelf: { frequency: 6000, gainDb: -1 },
      reverbWet: 0.12,
      reverbDecaySeconds: 0.9,
      compression: DEFAULT_COMP,
      outputGain: 1.1,
    },
  },
  {
    name: 'Voice of God',
    label: 'Voice of God',
    description: 'Deep, resonant, fills the heavens',
    icon: 'bolt',
    dsp: {
      inputGain: 1.2,
      lowShelf: { frequency: 150, gainDb: 7 },
      highShelf: { frequency: 7000, gainDb: 2 },
      reverbWet: 0.72,
      reverbDecaySeconds: 4.5,
      compression: HEAVY_COMP,
      outputGain: 0.85,
    },
  },
  {
    name: 'Demon',
    label: 'Demon',
    description: 'Dark, distorted, sinister',
    icon: 'local_fire_department',
    dsp: {
      inputGain: 1.3,
      lowShelf: { frequency: 100, gainDb: 5 },
      highShelf: { frequency: 3000, gainDb: -4 },
      distortion: 0.28,
      reverbWet: 0.42,
      reverbDecaySeconds: 2.8,
      compression: DEFAULT_COMP,
      outputGain: 0.82,
    },
  },
  {
    name: 'Dragon',
    label: 'Dragon',
    description: 'Massive, growling, ancient cave resonance',
    icon: 'whatshot',
    dsp: {
      inputGain: 1.4,
      lowShelf: { frequency: 80, gainDb: 9 },
      lowpass: { frequency: 2200, Q: 0.7 },
      distortion: 0.48,
      reverbWet: 0.55,
      reverbDecaySeconds: 5.5,
      compression: HEAVY_COMP,
      outputGain: 0.78,
    },
  },
  {
    name: 'Angel',
    label: 'Angel',
    description: 'Ethereal, pure, heavenly choir shimmer',
    icon: 'brightness_5',
    dsp: {
      inputGain: 0.9,
      lowShelf: { frequency: 200, gainDb: -2 },
      highShelf: { frequency: 5000, gainDb: 5 },
      reverbWet: 0.62,
      reverbDecaySeconds: 3.2,
      compression: DEFAULT_COMP,
      outputGain: 1.0,
    },
  },
  {
    name: 'Ghost',
    label: 'Ghost',
    description: 'Haunting, fading into silence',
    icon: 'blur_on',
    dsp: {
      inputGain: 0.8,
      highpass: { frequency: 300, Q: 0.8 },
      lowShelf: { frequency: 250, gainDb: -3 },
      reverbWet: 0.85,
      reverbDecaySeconds: 7.0,
      compression: null,
      outputGain: 0.65,
    },
  },
  {
    name: 'Robot',
    label: 'Robot / Construct',
    description: 'Metallic, mechanical, vocoder filter',
    icon: 'smart_toy',
    dsp: {
      inputGain: 1.1,
      highpass: { frequency: 320, Q: 1.4 },
      peak: { frequency: 1800, Q: 2.5, gainDb: 6 },
      highShelf: { frequency: 4000, gainDb: -3 },
      distortion: 0.38,
      reverbWet: 0.06,
      reverbDecaySeconds: 0.25,
      compression: DEFAULT_COMP,
      outputGain: 1.05,
    },
  },
  {
    name: 'Ancient',
    label: 'Ancient',
    description: 'Wise, slow, deep hall reverb',
    icon: 'hourglass_bottom',
    dsp: {
      inputGain: 1.0,
      lowShelf: { frequency: 300, gainDb: -2 },
      highShelf: { frequency: 5000, gainDb: -3 },
      distortion: 0.08,
      reverbWet: 0.65,
      reverbDecaySeconds: 4.8,
      compression: DEFAULT_COMP,
      outputGain: 0.9,
    },
  },
  {
    name: 'Whisper',
    label: 'Whisper',
    description: 'Breathy, intimate, pulls listeners close',
    icon: 'hearing',
    dsp: {
      inputGain: 0.7,
      highpass: { frequency: 180, Q: 0.7 },
      highShelf: { frequency: 5000, gainDb: 2 },
      reverbWet: 0.04,
      reverbDecaySeconds: 0.4,
      compression: null,
      outputGain: 0.6,
    },
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT PRESET CATALOGUE
// ═════════════════════════════════════════════════════════════════════════════

export const ENVIRONMENT_PRESETS: EnvironmentPreset[] = [
  {
    name: 'Default',
    label: 'Default',
    description: 'No acoustic treatment — clean, neutral signal',
    icon: 'graphic_eq',
    dsp: { lowpassFreq: 8000, reverbSend: 0, reverbDecaySeconds: 0.5, roomGainDb: 0 },
  },
  {
    name: 'Tavern',
    label: 'Tavern',
    description: 'Warm room, background chatter absorbed by timber walls',
    icon: 'local_bar',
    dsp: { lowpassFreq: 6500, reverbSend: 0.18, reverbDecaySeconds: 0.9, roomGainDb: 0 },
  },
  {
    name: 'Cave',
    label: 'Cave',
    description: 'Wet stone resonance, long decay, voices carry',
    icon: 'mountain_flag',
    dsp: { lowpassFreq: 5000, reverbSend: 0.52, reverbDecaySeconds: 3.2, roomGainDb: -1 },
  },
  {
    name: 'Forest',
    label: 'Forest',
    description: 'Open canopy, soft natural diffusion, little reverb',
    icon: 'forest',
    dsp: { lowpassFreq: 7500, reverbSend: 0.12, reverbDecaySeconds: 0.6, roomGainDb: 0 },
  },
  {
    name: 'Cathedral',
    label: 'Cathedral',
    description: 'Massive stone hall — voices reverberate for seconds',
    icon: 'church',
    dsp: { lowpassFreq: 7000, reverbSend: 0.78, reverbDecaySeconds: 5.0, roomGainDb: 1 },
  },
  {
    name: 'Dungeon',
    label: 'Dungeon',
    description: 'Dark, damp corridors — sound trapped and ominous',
    icon: 'lan',
    dsp: { lowpassFreq: 4500, reverbSend: 0.62, reverbDecaySeconds: 2.4, roomGainDb: -2 },
  },
  {
    name: 'City',
    label: 'City Street',
    description: 'Open plaza echo, diffuse reflections off stone buildings',
    icon: 'location_city',
    dsp: { lowpassFreq: 7000, reverbSend: 0.22, reverbDecaySeconds: 1.1, roomGainDb: 0 },
  },
  {
    name: 'Underwater',
    label: 'Underwater',
    description: 'Heavily muffled, bubbling resonance — speaking in water',
    icon: 'water',
    dsp: { lowpassFreq: 800, reverbSend: 0.68, reverbDecaySeconds: 2.0, roomGainDb: -3 },
  },
  {
    name: 'Night',
    label: 'Night / Open Air',
    description: 'Still night air — sound carries but no reflection',
    icon: 'bedtime',
    dsp: { lowpassFreq: 7200, reverbSend: 0.08, reverbDecaySeconds: 0.5, roomGainDb: -1 },
  },
  {
    name: 'Storm',
    label: 'Storm',
    description: 'Wind and rain scatter voices — struggle to be heard',
    icon: 'thunderstorm',
    dsp: { lowpassFreq: 5500, reverbSend: 0.28, reverbDecaySeconds: 1.2, roomGainDb: -4 },
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// DISTANCE PRESET CATALOGUE
// ═════════════════════════════════════════════════════════════════════════════

export const DISTANCE_PRESETS: DistancePreset[] = [
  {
    name: 'Default',
    label: 'Default',
    description: 'Normal conversational distance — no spatial processing',
    icon: 'person',
    dsp: { lowpassFreq: 8000, gainReduction: 0, reverbSend: 0 },
  },
  {
    name: 'Nearby',
    label: 'Nearby',
    description: "Within arm's reach — slightly softened",
    icon: 'social_distance',
    dsp: { lowpassFreq: 6500, gainReduction: 3, reverbSend: 0.06 },
  },
  {
    name: 'Visible',
    label: 'Visible',
    description: 'Across the room — noticeably attenuated',
    icon: 'visibility',
    dsp: { lowpassFreq: 4000, gainReduction: 9, reverbSend: 0.18 },
  },
  {
    name: 'Far',
    label: 'Far',
    description: 'Shouting distance — heavily filtered and faint',
    icon: 'location_searching',
    dsp: { lowpassFreq: 2000, gainReduction: 18, reverbSend: 0.38 },
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// CONDITION PRESET CATALOGUE
// ═════════════════════════════════════════════════════════════════════════════

export const CONDITION_PRESETS: ConditionPreset[] = [
  {
    name: 'Silenced',
    label: 'Silenced',
    description: 'Player cannot be heard — only DM and spectators hear them',
    icon: 'mic_off',
    dsp: { muted: true },
  },
  {
    name: 'Underwater',
    label: 'Underwater',
    description: 'Gurgling, muffled — as if speaking through water',
    icon: 'water',
    dsp: { lowpassFreq: 900, reverbSend: 0.65, gain: 0.8 },
  },
  {
    name: 'Drunk',
    label: 'Drunk',
    description: 'Slurred, heavy — voice loses its edge',
    icon: 'local_bar',
    dsp: { lowpassFreq: 3200, gain: 0.88 },
  },
  {
    name: 'Confused',
    label: 'Confused',
    description: 'Uncertain and scattered — voices blur together',
    icon: 'psychology_alt',
    dsp: { lowpassFreq: 4500, reverbSend: 0.35, gain: 0.82 },
  },
  {
    name: 'Poisoned',
    label: 'Poisoned',
    description: 'Weakened, strained — effort in every word',
    icon: 'emergency',
    dsp: { lowpassFreq: 2800, gain: 0.65 },
  },
  {
    name: 'Exhausted',
    label: 'Exhausted',
    description: 'Breathless — barely able to speak clearly',
    icon: 'battery_0_bar',
    dsp: { lowpassFreq: 4000, gain: 0.72 },
  },
  {
    name: 'Invisible',
    label: 'Invisible',
    description: 'Disembodied — voice seems to come from everywhere',
    icon: 'visibility_off',
    dsp: { reverbSend: 0.55, gain: 0.9 },
  },
  {
    name: 'Bleeding',
    label: 'Bleeding',
    description: 'Strained and laboured — pain in the voice',
    icon: 'favorite_border',
    dsp: { lowpassFreq: 3500, gain: 0.78 },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

export function findVoicePreset(name: string): VoicePreset | undefined {
  return VOICE_PRESETS.find((p) => p.name === name)
}

export function findEnvironmentPreset(name: string): EnvironmentPreset | undefined {
  return ENVIRONMENT_PRESETS.find((p) => p.name === name)
}

export function findDistancePreset(name: string): DistancePreset | undefined {
  return DISTANCE_PRESETS.find((p) => p.name === name)
}

export function findConditionPreset(name: string): ConditionPreset | undefined {
  return CONDITION_PRESETS.find((p) => p.name === name)
}

export const VOICE_PRESET_NAMES = new Set(VOICE_PRESETS.map((p) => p.name))
export const ENVIRONMENT_PRESET_NAMES = new Set(ENVIRONMENT_PRESETS.map((p) => p.name))
export const DISTANCE_PRESET_NAMES = new Set(DISTANCE_PRESETS.map((p) => p.name))
export const CONDITION_PRESET_NAMES = new Set(CONDITION_PRESETS.map((p) => p.name))
