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
    <section className="audio-panel__section" aria-label="Active audio effects">
      <h4 className="audio-panel__section-title">Effects</h4>
      <ul className="audio-panel__chips">
        <li className="audio-panel__chip">PTT: {pttActive ? 'On' : 'Off'}</li>
        <li className="audio-panel__chip">Clean Mode: {privateRoomCleanMode ? 'On' : 'Off'}</li>
        <li className="audio-panel__chip">Active Effects: {activeEffectsCount}</li>
      </ul>
    </section>
  )
}
