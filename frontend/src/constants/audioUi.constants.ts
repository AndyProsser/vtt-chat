export type AudioConnectionStatusState = 'connected' | 'connecting' | 'disconnected'

export const AUDIO_CONTROL_COPY = {
  muted: 'Muted',
  live: 'Live',
  muteMicrophone: 'Mute microphone',
  unmuteMicrophone: 'Unmute microphone',
  voiceNotConnected: 'Voice not connected',
  pushToTalk: 'Push to talk',
  pushToTalkHold: 'Push to talk (hold)',
  audioSettings: 'Audio settings',
  dmVoiceOverride: 'DM Voice Override',
  dmOverrides: 'DM Overrides',
  muteDmChannel: 'Mute DM Channel',
  unmuteDmChannel: 'Unmute DM Channel',
  publishing: 'Publishing',
  notPublishing: 'Not publishing',
  activeAudioEffects: 'Active audio effects',
  audioEffects: 'Audio Effects',
  effects: 'Effects',
  noActiveProcessing: 'No active processing enabled.',
  dmAudioOverrides: 'DM audio overrides',
  dmAudioOverridesTitle: 'DM Audio Overrides',
  noActiveDmAudioOverrides: 'No active DM audio overrides.',
  noActiveOverrides: 'No active overrides',
  activeEffectsLabel: 'Active Effects',
  activeCountSuffix: 'active',
  pttShortLabel: 'PTT',
  cleanModeLabel: 'Clean Mode',
  on: 'On',
  off: 'Off',
  moreSuffix: 'more',
} as const

export const AUDIO_SETTINGS_COPY = {
  title: 'Audio Settings',
  close: 'Close audio settings',
  speaker: 'Speaker',
  microphone: 'Microphone',
  systemDefault: 'System default',
  outgoingMicrophoneSignal: 'Outgoing microphone signal',
  outgoingMicrophoneLevel: 'Outgoing microphone level',
  autoGain: 'Auto Gain',
  sensitivity: 'Sensitivity',
  microphoneSensitivity: 'Microphone sensitivity',
  noiseFilter: 'Noise Filter',
  noiseFilterLevel: 'Noise filter level',
  masterVolume: 'Master Volume',
  masterVolumeAria: 'Master volume',
  speakerFallbackPrefix: 'Speaker',
  microphoneFallbackPrefix: 'Microphone',
} as const

export const AUDIO_EFFECT_COPY = {
  pushToTalkName: 'Push to Talk',
  pttHeldDescription: 'Mic gate is currently open while PTT is held.',
  pttIdleDescription: 'Mic stays muted until PTT is held.',
  environmentDescription: 'Applies room acoustics and reverb to match environment.',
  distanceDescription: 'Adjusts attenuation and filtering for listener distance.',
  conditionDescription: 'Adds scene condition processing to the audio chain.',
  voiceDescription: 'Transforms voice character (pitch/formant) for roleplay.',
  inCharacterDescription: 'Applies in-character voice coloration preset.',
  customDescription: 'Custom active effect enabled in the current stack.',
} as const

export const AUDIO_OVERRIDE_COPY = {
  muteDescription: 'Forces the target user microphone to muted.',
  unmuteDescription: 'Explicitly allows the target user microphone signal.',
  gateDescription: 'Applies DM gate threshold to suppress background noise.',
  filterDescription: 'Applies a DM filter profile to the target signal.',
  gainCustomValue: 'custom value',
} as const

export const AUDIO_CONNECTION_STATUS_TITLES: Record<AudioConnectionStatusState, string> = {
  connected: 'Voice connected',
  connecting: 'Voice connecting…',
  disconnected: 'Voice disconnected',
}

export function getAudioModeLabel(isMuted: boolean): string {
  return isMuted ? AUDIO_CONTROL_COPY.muted : AUDIO_CONTROL_COPY.live
}

export function getMicrophoneControlLabel(params: {
  microphoneOn: boolean
  isVoiceConnected: boolean
}): string {
  if (params.microphoneOn) {
    return AUDIO_CONTROL_COPY.muteMicrophone
  }

  if (params.isVoiceConnected) {
    return AUDIO_CONTROL_COPY.unmuteMicrophone
  }

  return AUDIO_CONTROL_COPY.voiceNotConnected
}

export function getLiveKitBadgeLabel(params: {
  statusState: AudioConnectionStatusState
  hasLocalPublication: boolean
  liveKitConnectionKey: string
}): string {
  const publicationLabel = params.hasLocalPublication
    ? AUDIO_CONTROL_COPY.publishing
    : AUDIO_CONTROL_COPY.notPublishing

  return `LiveKit ${params.statusState}. ${publicationLabel}. Channel ${params.liveKitConnectionKey}`
}

export function getAudioQuickPanelCountLabel(count: number): string {
  return `${AUDIO_CONTROL_COPY.audioEffects} (${count} ${AUDIO_CONTROL_COPY.activeCountSuffix})`
}

export function getAudioQuickPanelAriaLabel(count: number): string {
  return `${AUDIO_CONTROL_COPY.audioEffects}, ${count} ${AUDIO_CONTROL_COPY.activeCountSuffix}`
}

export function getDmOverridesCountLabel(count: number): string {
  return `${AUDIO_CONTROL_COPY.dmOverrides} (${count} ${AUDIO_CONTROL_COPY.activeCountSuffix})`
}

export function getDmOverridesAriaLabel(count: number): string {
  return `${AUDIO_CONTROL_COPY.dmAudioOverrides}, ${count} ${AUDIO_CONTROL_COPY.activeCountSuffix}`
}

export function getDMVoiceChannelButtonLabel(muted: boolean): string {
  return muted ? AUDIO_CONTROL_COPY.unmuteDmChannel : AUDIO_CONTROL_COPY.muteDmChannel
}

export function getPushToTalkEffectDescription(pttActive: boolean): string {
  return pttActive ? AUDIO_EFFECT_COPY.pttHeldDescription : AUDIO_EFFECT_COPY.pttIdleDescription
}

export function getAudioOverrideName(
  overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER',
  shortUser: string
): string {
  if (overrideType === 'MUTE') {
    return `${AUDIO_CONTROL_COPY.muteMicrophone.replace(' microphone', '')} (${shortUser})`
  }

  if (overrideType === 'UNMUTE') {
    return `${AUDIO_CONTROL_COPY.unmuteMicrophone.replace(' microphone', '')} (${shortUser})`
  }

  if (overrideType === 'GAIN') {
    return `Gain (${shortUser})`
  }

  if (overrideType === 'GATE') {
    return `Gate (${shortUser})`
  }

  return `Filter (${shortUser})`
}

export function getAudioOverrideDescription(params: {
  overrideType: 'MUTE' | 'UNMUTE' | 'GAIN' | 'GATE' | 'FILTER'
  gain?: number | null
}): string {
  if (params.overrideType === 'MUTE') {
    return AUDIO_OVERRIDE_COPY.muteDescription
  }

  if (params.overrideType === 'UNMUTE') {
    return AUDIO_OVERRIDE_COPY.unmuteDescription
  }

  if (params.overrideType === 'GAIN') {
    const gainText =
      typeof params.gain === 'number'
        ? `${params.gain.toFixed(2)}x`
        : AUDIO_OVERRIDE_COPY.gainCustomValue
    return `Adjusts target gain (${gainText}).`
  }

  if (params.overrideType === 'GATE') {
    return AUDIO_OVERRIDE_COPY.gateDescription
  }

  return AUDIO_OVERRIDE_COPY.filterDescription
}

export function getFallbackAudioDeviceLabel(kind: 'speaker' | 'microphone', index: number): string {
  const prefix =
    kind === 'speaker'
      ? AUDIO_SETTINGS_COPY.speakerFallbackPrefix
      : AUDIO_SETTINGS_COPY.microphoneFallbackPrefix

  return `${prefix} ${index + 1}`
}
