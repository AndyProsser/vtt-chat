import type { UUID } from '@shared'
import type { AudioDMOverride } from '@/types/audio'
import { AUDIO_CONTROL_COPY } from '@/constants/audioUi.constants'
import { flattenAudioDMOverrides, type AudioDMOverridesByUser } from '@/utils/audioOverrides'

interface AudioDMOverridesPanelProps {
  isDm: boolean
  dmOverrides: AudioDMOverridesByUser
}

export function AudioDMOverridesPanel({ isDm, dmOverrides }: AudioDMOverridesPanelProps) {
  if (!isDm) {
    return null
  }

  const overrides = flattenAudioDMOverrides(dmOverrides)

  return (
    <section
      className="session-audio-panel__section"
      aria-label={AUDIO_CONTROL_COPY.dmAudioOverrides}
    >
      <h4 className="session-audio-panel__section-title">{AUDIO_CONTROL_COPY.dmOverrides}</h4>
      {overrides.length === 0 ? (
        <p className="session-audio-panel__section-empty">{AUDIO_CONTROL_COPY.noActiveOverrides}</p>
      ) : (
        <ul className="session-audio-panel__chips">
          {overrides.slice(0, 4).map((override) => (
            <li
              key={`${override.userId}-${override.overrideType}`}
              className="session-audio-panel__chip"
            >
              {override.overrideType}
            </li>
          ))}
          {overrides.length > 4 ? (
            <li className="session-audio-panel__chip">
              +{overrides.length - 4} {AUDIO_CONTROL_COPY.moreSuffix}
            </li>
          ) : null}
        </ul>
      )}
    </section>
  )
}
