import { findConditionPreset, findDistancePreset } from '@shared'

interface HistoryConditionMarkerRowProps {
  isRemoval: boolean
  overrideType: 'CONDITION' | 'DISTANCE'
  presetName?: string
  targetName: string
  timestampLabel: string
  timestampISO: string
}

export function HistoryConditionMarkerRow({
  isRemoval,
  overrideType,
  presetName,
  targetName,
  timestampLabel,
  timestampISO,
}: HistoryConditionMarkerRowProps) {
  const isDistance = overrideType === 'DISTANCE'
  const conditionPreset = !isDistance && presetName ? findConditionPreset(presetName) : undefined
  const distancePreset = isDistance && presetName ? findDistancePreset(presetName) : undefined
  const preset = conditionPreset ?? distancePreset
  const label = preset?.label ?? presetName ?? (isDistance ? 'distant' : 'affected')

  let iconName: string
  let markerContent: React.ReactElement

  if (isRemoval) {
    iconName = isDistance ? 'person' : 'check_circle'
    markerContent = isDistance ? (
      <>
        <strong>{targetName}</strong> has returned to the party
      </>
    ) : (
      <>
        <strong>{targetName}</strong>
        {`'s condition was cleared`}
      </>
    )
  } else {
    iconName = preset?.icon ?? (isDistance ? 'social_distance' : 'psychology')
    markerContent = (
      <>
        {targetName} is <strong>{label}</strong>
      </>
    )
  }

  return (
    <article
      className={`session-message-list__condition-marker ${isDistance ? 'session-message-list__condition-marker--distance' : 'session-message-list__condition-marker--condition'} ${isRemoval ? 'session-message-list__condition-marker--removal' : ''}`}
      role="status"
    >
      <span
        className="session-message-list__condition-marker-icon material-symbols-outlined"
        aria-hidden="true"
      >
        {iconName}
      </span>
      <span className="session-message-list__condition-marker-text">{markerContent}</span>
      <span className="session-message-list__condition-marker-line" aria-hidden="true" />
      <time className="session-message-list__condition-marker-time" dateTime={timestampISO}>
        {timestampLabel}
      </time>
    </article>
  )
}
