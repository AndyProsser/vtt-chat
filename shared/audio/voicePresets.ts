/**
 * DM Voice Presets — Canonical Definitions
 *
 * Single source of truth for both frontend (DSP chain) and backend (validation).
 * The `dsp` block maps directly to Web Audio API parameters applied to the DM's
 * local mic track before LiveKit publishes it. All processing is client-side.
 *
 * DSP signal path (applied in order):
 *   Mic → inputGain → highpass? → lowpass? → lowShelf? → highShelf? → peak? →
 *   distortion? → compression? → [dry mix + reverb send] → outputGain → LiveKit
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VoicePresetDsp {
  /** Input gain multiplier before any processing (1.0 = unity). */
  inputGain: number

  /** High-pass filter — removes frequencies below this Hz (reduces rumble/boom). */
  highpass?: { frequency: number; Q: number }

  /** Low-pass filter — removes frequencies above this Hz (muffle, distance). */
  lowpass?: { frequency: number; Q: number }

  /** Low-shelf EQ — boosts or cuts all freqs below the shelf (gainDb +/-). */
  lowShelf?: { frequency: number; gainDb: number }

  /** High-shelf EQ — boosts or cuts all freqs above the shelf (gainDb +/-). */
  highShelf?: { frequency: number; gainDb: number }

  /** Peaking EQ — boost or cut around a center frequency. */
  peak?: { frequency: number; Q: number; gainDb: number }

  /**
   * Waveshaper distortion intensity (0 = off, 1 = extreme saturation).
   * Uses a soft-clip curve: low values add warmth/character, high values crunch.
   */
  distortion?: number

  /**
   * Dynamics compressor settings.
   * Enabled by default with sensible values; override to taste.
   * null = no compression.
   */
  compression?: {
    threshold: number // dB below which no compression, e.g. -24
    knee: number // dB of smooth transition range
    ratio: number // e.g. 4 = 4:1 compression
    attack: number // seconds
    release: number // seconds
  } | null

  /** Reverb wet/dry mix (0 = fully dry, 1 = fully wet). */
  reverbWet: number

  /**
   * Synthetic reverb decay time in seconds.
   * Longer = bigger space. Generated algorithmically (no IR file needed).
   */
  reverbDecaySeconds: number

  /** Final output gain multiplier. */
  outputGain: number
}

export interface VoicePreset {
  /** Unique identifier used in WS events and API calls. */
  name: string
  /** Display label shown in the UI. */
  label: string
  /** One-line tooltip description. */
  description: string
  /** Material Symbols icon name. */
  icon: string
  /** The DSP parameters applied to the DM's outgoing mic. */
  dsp: VoicePresetDsp
}

// ─────────────────────────────────────────────────────────────────────────────
// Default compression (used by most presets for broadcast-friendly dynamics)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_COMPRESSION: VoicePresetDsp['compression'] = {
  threshold: -24,
  knee: 8,
  ratio: 4,
  attack: 0.003,
  release: 0.25,
}

const HEAVY_COMPRESSION: VoicePresetDsp['compression'] = {
  threshold: -18,
  knee: 4,
  ratio: 8,
  attack: 0.001,
  release: 0.1,
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset Catalogue
// ─────────────────────────────────────────────────────────────────────────────

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
      compression: DEFAULT_COMPRESSION,
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
      compression: HEAVY_COMPRESSION,
      outputGain: 0.85,
    },
  },
  {
    name: 'Demon',
    label: 'Demon',
    description: 'Dark, distorted, pitch-shifted down',
    icon: 'local_fire_department',
    dsp: {
      inputGain: 1.3,
      lowShelf: { frequency: 100, gainDb: 5 },
      highShelf: { frequency: 3000, gainDb: -4 },
      distortion: 0.28,
      reverbWet: 0.42,
      reverbDecaySeconds: 2.8,
      compression: DEFAULT_COMPRESSION,
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
      compression: HEAVY_COMPRESSION,
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
      compression: DEFAULT_COMPRESSION,
      outputGain: 1.0,
    },
  },
  {
    name: 'Ghost',
    label: 'Ghost',
    description: 'Haunting tremolo, fading into silence',
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
      compression: DEFAULT_COMPRESSION,
      outputGain: 1.05,
    },
  },
  {
    name: 'Ancient',
    label: 'Ancient',
    description: 'Slow, wise, deep hall reverb',
    icon: 'hourglass_bottom',
    dsp: {
      inputGain: 1.0,
      lowShelf: { frequency: 300, gainDb: -2 },
      highShelf: { frequency: 5000, gainDb: -3 },
      distortion: 0.08,
      reverbWet: 0.65,
      reverbDecaySeconds: 4.8,
      compression: DEFAULT_COMPRESSION,
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

/** Lookup by preset name. Returns undefined if name is not a valid preset. */
export function findVoicePreset(name: string): VoicePreset | undefined {
  return VOICE_PRESETS.find((p) => p.name === name)
}

/** Set of valid preset names for fast validation. */
export const VOICE_PRESET_NAMES = new Set(VOICE_PRESETS.map((p) => p.name))
