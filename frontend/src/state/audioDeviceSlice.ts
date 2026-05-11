import type { StateCreator } from 'zustand'
import type { AudioDeviceState } from '@/types/audio'

export interface AudioDeviceSlice {
  device: AudioDeviceState
  initializeAudio: (enabled: boolean) => void
  setDevice: (state: Partial<AudioDeviceState>) => void
}

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

export const createAudioDeviceSlice: StateCreator<AudioDeviceSlice, [], [], AudioDeviceSlice> = (
  set
) => ({
  device: initialAudioDeviceState,

  initializeAudio: (enabled) =>
    set((state) => ({
      device: {
        ...state.device,
        enabled,
      },
    })),

  setDevice: (updates) =>
    set((state) => ({
      device: {
        ...state.device,
        ...updates,
      },
    })),
})
