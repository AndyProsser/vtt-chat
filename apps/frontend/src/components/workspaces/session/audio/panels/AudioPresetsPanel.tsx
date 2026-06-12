import type {
  ConditionPreset,
  DistancePreset,
  EnvironmentPreset,
  ICPreset,
  VoicePreset,
} from '@/types/audio'

interface AudioPresetsPanelProps {
  currentEnvironment?: EnvironmentPreset
  currentDistance?: DistancePreset
  currentCondition?: ConditionPreset
  currentVoicePreset?: VoicePreset
  currentICPreset?: ICPreset
}

export function AudioPresetsPanel({
  currentEnvironment,
  currentDistance,
  currentCondition,
  currentVoicePreset,
  currentICPreset,
}: AudioPresetsPanelProps) {
  const hasAnyPreset = Boolean(
    currentEnvironment ||
    currentDistance ||
    currentCondition ||
    currentVoicePreset ||
    currentICPreset
  )

  if (!hasAnyPreset) {
    return null
  }

  return (
    <section className="session-audio-panel__section" aria-label="Active audio presets">
      <h4 className="session-audio-panel__section-title">Presets</h4>
      <ul className="session-audio-panel__chips">
        {currentEnvironment && (
          <li className="session-audio-panel__chip">Env: {currentEnvironment.name}</li>
        )}
        {currentDistance && (
          <li className="session-audio-panel__chip">Distance: {currentDistance.name}</li>
        )}
        {currentCondition && (
          <li className="session-audio-panel__chip">Condition: {currentCondition.name}</li>
        )}
        {currentVoicePreset && (
          <li className="session-audio-panel__chip">DM Voice: {currentVoicePreset.name}</li>
        )}
        {currentICPreset && (
          <li className="session-audio-panel__chip">IC Voice: {currentICPreset.name}</li>
        )}
      </ul>
    </section>
  )
}
