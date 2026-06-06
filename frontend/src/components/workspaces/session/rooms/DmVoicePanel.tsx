/**
 * DmVoicePanel
 * Slide-down panel for the DM to select a voice preset (Demon, Angel, etc.).
 * Only one preset is active at a time. Tapping the header button again clears it.
 * Opened from the voice-mode button in GroupsHeaderActions.
 */

import { memo } from 'react'
import { DM_VOICE_PRESETS } from '@/constants/dmVoicePresets.constants'


interface DmVoicePanelProps {
  activePreset: string | null
  onSelect: (presetName: string | null) => void
}

export const DmVoicePanel = memo(function DmVoicePanel({
  activePreset,
  onSelect,
}: DmVoicePanelProps) {
  return (
    <div className="dm-voice-panel" role="dialog" aria-label="DM voice preset">
      <p className="dm-voice-panel__title">Voice preset</p>
      <div className="dm-voice-panel__grid">
        {DM_VOICE_PRESETS.map((preset) => {
          const isActive = activePreset === preset.name
          return (
            <button
              key={preset.name}
              type="button"
              className={`dm-voice-panel__preset ${isActive ? 'is-active' : ''}`}
              aria-pressed={isActive}
              title={preset.description}
              onClick={() => onSelect(isActive ? null : preset.name)}
            >
              <span
                className="material-symbols-outlined dm-voice-panel__preset-icon"
                aria-hidden="true"
              >
                {preset.icon}
              </span>
              <span className="dm-voice-panel__preset-label">{preset.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
})
