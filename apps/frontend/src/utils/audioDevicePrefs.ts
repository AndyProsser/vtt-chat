/**
 * audioDevicePrefs
 *
 * Local (per-browser/per-machine) persistence for the user's audio device
 * preferences. Device selection is inherently machine-dependent — the chosen
 * mic/speaker, gain, and filter settings belong to *this* device, not the user's
 * server-side account — so they live in localStorage rather than the backend.
 *
 * Hydrated into the audio-device Zustand slice on app load and rewritten by
 * `setDevice` whenever a persisted field changes. Because `selectedMicDeviceId`
 * is read by useLiveKit's getUserMedia constraints, restoring it on load means
 * the saved mic is used the moment the user hits unmute — no re-selection.
 *
 * Runtime/transient fields (`enabled`, `microphoneOn`, `isSpeaking`) are
 * intentionally NOT persisted: the app should always load muted and re-derive
 * permission state, never auto-open the mic from a stored flag.
 */
import type { AudioDeviceState } from '@/types/audio'

const STORAGE_KEY = 'vtt-audio-device-prefs'

const NOISE_FILTER_LEVELS: ReadonlyArray<AudioDeviceState['noiseFilterLevel']> = [
  'auto',
  'low',
  'medium',
  'high',
]

/** Device-local, persistent subset of the audio device state. */
export type PersistedAudioDevicePrefs = Pick<
  AudioDeviceState,
  | 'selectedMicDeviceId'
  | 'selectedSpeakerDeviceId'
  | 'micGain'
  | 'volumeLevel'
  | 'backgroundAudioLevel'
  | 'pttEnabled'
  | 'autoGainEnabled'
  | 'noiseFilterLevel'
>

const PERSISTED_KEYS: ReadonlyArray<keyof PersistedAudioDevicePrefs> = [
  'selectedMicDeviceId',
  'selectedSpeakerDeviceId',
  'micGain',
  'volumeLevel',
  'backgroundAudioLevel',
  'pttEnabled',
  'autoGainEnabled',
  'noiseFilterLevel',
]

/** Whether a `setDevice` update touches any persisted preference. */
export function updateTouchesPersistedPrefs(updates: Partial<AudioDeviceState>): boolean {
  return PERSISTED_KEYS.some((key) => key in updates)
}

/**
 * Load saved device preferences. Returns an empty object when nothing is stored,
 * the value is malformed, or storage is unavailable (SSR / private mode). Each
 * field is type-checked so corrupt storage can never poison the device state.
 */
export function loadAudioDevicePrefs(): Partial<PersistedAudioDevicePrefs> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<PersistedAudioDevicePrefs> = {}

    if (typeof parsed.selectedMicDeviceId === 'string')
      out.selectedMicDeviceId = parsed.selectedMicDeviceId
    if (typeof parsed.selectedSpeakerDeviceId === 'string')
      out.selectedSpeakerDeviceId = parsed.selectedSpeakerDeviceId
    if (typeof parsed.micGain === 'number') out.micGain = parsed.micGain
    if (typeof parsed.volumeLevel === 'number') out.volumeLevel = parsed.volumeLevel
    if (typeof parsed.backgroundAudioLevel === 'number')
      out.backgroundAudioLevel = parsed.backgroundAudioLevel
    if (typeof parsed.pttEnabled === 'boolean') out.pttEnabled = parsed.pttEnabled
    if (typeof parsed.autoGainEnabled === 'boolean') out.autoGainEnabled = parsed.autoGainEnabled
    if (
      typeof parsed.noiseFilterLevel === 'string' &&
      NOISE_FILTER_LEVELS.includes(parsed.noiseFilterLevel as AudioDeviceState['noiseFilterLevel'])
    )
      out.noiseFilterLevel = parsed.noiseFilterLevel as AudioDeviceState['noiseFilterLevel']

    return out
  } catch {
    return {}
  }
}

/** Persist the device-local subset of the current device state. No-ops on failure. */
export function saveAudioDevicePrefs(device: AudioDeviceState): void {
  if (typeof window === 'undefined') return

  try {
    const subset: PersistedAudioDevicePrefs = {
      selectedMicDeviceId: device.selectedMicDeviceId,
      selectedSpeakerDeviceId: device.selectedSpeakerDeviceId,
      micGain: device.micGain,
      volumeLevel: device.volumeLevel,
      backgroundAudioLevel: device.backgroundAudioLevel,
      pttEnabled: device.pttEnabled,
      autoGainEnabled: device.autoGainEnabled,
      noiseFilterLevel: device.noiseFilterLevel,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subset))
  } catch {
    /* quota exceeded / storage disabled — preferences just won't persist */
  }
}
