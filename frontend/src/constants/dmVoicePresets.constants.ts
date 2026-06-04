/**
 * DM Voice Presets
 * Applied only to the DM's microphone chain. One active at a time.
 * Cleared on session end or when DM taps the button again (one-click dismiss).
 */

export interface DmVoicePreset {
  name: string
  label: string
  description: string
  icon: string
}

export const DM_VOICE_PRESETS: DmVoicePreset[] = [
  {
    name: 'Narrator',
    label: 'Narrator',
    description: 'Warm, theatrical storytelling voice',
    icon: 'menu_book',
  },
  {
    name: 'Voice of God',
    label: 'Voice of God',
    description: 'Deep, resonant, fills the heavens',
    icon: 'bolt',
  },
  {
    name: 'Demon',
    label: 'Demon',
    description: 'Dark, distorted, pitch-shifted down',
    icon: 'local_fire_department',
  },
  {
    name: 'Dragon',
    label: 'Dragon',
    description: 'Massive, growling, ancient cave resonance',
    icon: 'whatshot',
  },
  {
    name: 'Angel',
    label: 'Angel',
    description: 'Ethereal, pure, heavenly choir shimmer',
    icon: 'brightness_5',
  },
  {
    name: 'Ghost',
    label: 'Ghost',
    description: 'Haunting tremolo, fading into silence',
    icon: 'blur_on',
  },
  {
    name: 'Robot',
    label: 'Robot / Construct',
    description: 'Metallic, mechanical, vocoder filter',
    icon: 'smart_toy',
  },
  {
    name: 'Ancient',
    label: 'Ancient',
    description: 'Slow, wise, deep hall reverb',
    icon: 'hourglass_bottom',
  },
  {
    name: 'Whisper',
    label: 'Whisper',
    description: 'Breathy, intimate, pulls listeners close',
    icon: 'hearing',
  },
]
