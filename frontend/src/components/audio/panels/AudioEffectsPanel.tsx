import { AUDIO_CONTROL_COPY } from '../../../constants/audioUi.constants'

interface AudioEffectsPanelProps {
  pttActive: boolean
  privateRoomCleanMode: boolean
  activeEffectsCount: number
}

export function AudioEffectsPanel({
  pttActive,
  privateRoomCleanMode,
  activeEffectsCount,
}: AudioEffectsPanelProps) {
  return (
    <section className="audio-panel__section" aria-label={AUDIO_CONTROL_COPY.activeAudioEffects}>
      <h4 className="audio-panel__section-title">{AUDIO_CONTROL_COPY.effects}</h4>
      <ul className="audio-panel__chips">
        <li className="audio-panel__chip">
          {AUDIO_CONTROL_COPY.pttShortLabel}:{' '}
          {pttActive ? AUDIO_CONTROL_COPY.on : AUDIO_CONTROL_COPY.off}
        </li>
        <li className="audio-panel__chip">
          {AUDIO_CONTROL_COPY.cleanModeLabel}:{' '}
          {privateRoomCleanMode ? AUDIO_CONTROL_COPY.on : AUDIO_CONTROL_COPY.off}
        </li>
        <li className="audio-panel__chip">
          {AUDIO_CONTROL_COPY.activeEffectsLabel}: {activeEffectsCount}
        </li>
      </ul>
    </section>
  )
}
