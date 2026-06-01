import { useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import { DND_5_5E_SRD_CLASSES, DND_5_5E_SRD_SPECIES } from '@/constants/characterSrd.constants'
import { CharacterAvatarUploadField } from './CharacterAvatarUploadField'
import { VerticalSliderInput } from './VerticalSliderInput'
import '@/styles/components/workspaces/shared/panels/WorkspaceSettingsPanel.css'

export interface PlayerSettingsPanel {
  name: string
  race: string
  className: string
  subclass: string
  avatarUrl: string
  level: number
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}

export interface PlayerSettingsPanelProps {
  campaignId: string | null
  characterDraft: PlayerSettingsPanel
  onCharacterFieldChange: (field: keyof PlayerSettingsPanel, value: string | number) => void
  onSaveCharacterSettings: () => void
  isCharacterLoading: boolean
  isCharacterSaving: boolean
  focusRequestKey?: number
}

export function PlayerSettingsPanel(props: PlayerSettingsPanelProps) {
  const nameInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (typeof props.focusRequestKey !== 'number') {
      return
    }

    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [props.focusRequestKey])

  return (
    <div className="crbs-panel" aria-label="Player settings">
      <div className="crbs-panel-header">
        <h3 className="crbs-heading">
          <Icon name="settings" />
          Player Settings
        </h3>
        <button
          type="button"
          className="session-icon-action session-icon-action--icon"
          aria-label={props.isCharacterSaving ? 'Saving character' : 'Save character'}
          disabled={!props.campaignId || props.isCharacterLoading || props.isCharacterSaving}
          onClick={props.onSaveCharacterSettings}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {props.isCharacterSaving ? 'hourglass_top' : 'save'}
          </span>
        </button>
      </div>

      <section className="crbs-section">
        <h4 className="crbs-section-heading">Character Profile</h4>
        <p className="crbs-description">Your active character profile for this campaign.</p>

        <div className="csp-card">
          <div className="crbs-character-grid">
            <label className="crbs-field" htmlFor="crbs-character-name">
              <span className="crbs-field-label">Name</span>
              <input
                id="crbs-character-name"
                ref={nameInputRef}
                type="text"
                className="crbs-input"
                value={props.characterDraft.name}
                onChange={(event) => props.onCharacterFieldChange('name', event.target.value)}
                disabled={props.isCharacterLoading || props.isCharacterSaving}
              />
            </label>
            <label className="crbs-field" htmlFor="crbs-character-race">
              <span className="crbs-field-label">Race</span>
              <input
                id="crbs-character-race"
                type="text"
                className="crbs-input"
                list="crbs-character-race-suggestions"
                value={props.characterDraft.race}
                onChange={(event) => props.onCharacterFieldChange('race', event.target.value)}
                disabled={props.isCharacterLoading || props.isCharacterSaving}
              />
              <datalist id="crbs-character-race-suggestions">
                {DND_5_5E_SRD_SPECIES.map((species) => (
                  <option key={species} value={species} />
                ))}
              </datalist>
            </label>
            <label className="crbs-field" htmlFor="crbs-character-class">
              <span className="crbs-field-label">Class</span>
              <input
                id="crbs-character-class"
                type="text"
                className="crbs-input"
                list="crbs-character-class-suggestions"
                value={props.characterDraft.className}
                onChange={(event) => props.onCharacterFieldChange('className', event.target.value)}
                disabled={props.isCharacterLoading || props.isCharacterSaving}
              />
              <datalist id="crbs-character-class-suggestions">
                {DND_5_5E_SRD_CLASSES.map((className) => (
                  <option key={className} value={className} />
                ))}
              </datalist>
            </label>
            <label className="crbs-field" htmlFor="crbs-character-subclass">
              <span className="crbs-field-label">Subclass</span>
              <input
                id="crbs-character-subclass"
                type="text"
                className="crbs-input"
                value={props.characterDraft.subclass}
                onChange={(event) => props.onCharacterFieldChange('subclass', event.target.value)}
                disabled={props.isCharacterLoading || props.isCharacterSaving}
              />
            </label>
          </div>

          <div className="crbs-attributes-row">
            <label className="crbs-field crbs-field--level" htmlFor="crbs-character-level">
              <span className="crbs-field-label">Level</span>
              <VerticalSliderInput
                id="crbs-character-level"
                label="Level (1–20)"
                min={1}
                max={20}
                value={props.characterDraft.level}
                onChange={(v) => props.onCharacterFieldChange('level', v)}
                disabled={props.isCharacterLoading || props.isCharacterSaving}
                triggerMode="click"
              />
            </label>

            <div className="crbs-stats-strip" role="group" aria-label="Character stats">
              {[
                ['strength', 'STR'],
                ['dexterity', 'DEX'],
                ['constitution', 'CON'],
                ['intelligence', 'INT'],
                ['wisdom', 'WIS'],
                ['charisma', 'CHA'],
              ].map(([field, label]) => (
                <label key={field} className="crbs-field crbs-field--stat">
                  <span className="crbs-field-label">{label}</span>
                  <VerticalSliderInput
                    label={`${label} (1–30)`}
                    min={1}
                    max={30}
                    value={props.characterDraft[field as keyof PlayerSettingsPanel] as number}
                    onChange={(v) =>
                      props.onCharacterFieldChange(field as keyof PlayerSettingsPanel, v)
                    }
                    disabled={props.isCharacterLoading || props.isCharacterSaving}
                    triggerMode="click"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <CharacterAvatarUploadField
          value={props.characterDraft.avatarUrl}
          onChange={(value) => props.onCharacterFieldChange('avatarUrl', value)}
          disabled={props.isCharacterLoading || props.isCharacterSaving}
        />
      </section>
    </div>
  )
}
