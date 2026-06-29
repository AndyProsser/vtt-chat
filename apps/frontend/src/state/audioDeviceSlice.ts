import type { StateCreator } from 'zustand'
import type { AudioDeviceState } from '@/types/audio'
import {
  loadAudioDevicePrefs,
  saveAudioDevicePrefs,
  updateTouchesPersistedPrefs,
} from '@/utils/audioDevicePrefs'

export interface AudioDeviceSlice {
  device: AudioDeviceState
  initializeAudio: (enabled: boolean) => void
  setDevice: (state: Partial<AudioDeviceState>) => void
}

/** Factory defaults. Runtime fields (enabled/microphoneOn/isSpeaking) always
 *  start fresh; device-local preferences are overlaid from localStorage via
 *  `hydratedAudioDeviceState()`. */
export const initialAudioDeviceState: AudioDeviceState = {
  enabled: false,
  microphoneOn: false,
  micGain: 80,
  volumeLevel: 75,
  backgroundAudioLevel: 20,
  isSpeaking: false,
  pttEnabled: false,
  autoGainEnabled: true,
  noiseFilterLevel: 'auto',
}

/** Defaults with the user's persisted device preferences applied. Use this for
 *  both initial slice state and reset, so a remembered mic/speaker survives page
 *  refresh and session resets (and is used the instant the user unmutes). */
export const hydratedAudioDeviceState = (): AudioDeviceState => ({
  ...initialAudioDeviceState,
  ...loadAudioDevicePrefs(),
})

export const createAudioDeviceSlice: StateCreator<AudioDeviceSlice, [], [], AudioDeviceSlice> = (
  set
) => ({
  device: hydratedAudioDeviceState(),

  initializeAudio: (enabled) =>
    set((state) => {
      if (state.device.enabled === enabled) {
        return state
      }

      return {
        device: {
          ...state.device,
          enabled,
        },
      }
    }),

  setDevice: (updates) =>
    set((state) => {
      const updateEntries = Object.entries(updates) as Array<[keyof AudioDeviceState, unknown]>
      const hasChange = updateEntries.some(([key, value]) => state.device[key] !== value)

      if (!hasChange) {
        return state
      }

      const device = {
        ...state.device,
        ...updates,
      }

      // Persist device-local preferences (selected mic/speaker, gain, filters)
      // whenever one actually changes, so they survive refresh and resets.
      if (updateTouchesPersistedPrefs(updates)) {
        saveAudioDevicePrefs(device)
      }

      return { device }
    }),
})
