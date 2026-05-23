import { Icon } from '@/components/ui/Icon'
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
}

export function PlayerSettingsPanel(props: PlayerSettingsPanelProps) {
  return (
    <div className="crbs-panel" aria-label="Player settings">
      <h3 className="crbs-heading">
        <Icon name="settings" />
        Player Settings
      </h3>

      <section className="crbs-section">
        <h4 className="crbs-section-heading">Character Profile</h4>
        <p className="crbs-description">Your active character profile for this campaign.</p>

        <div className="crbs-character-grid">
          <label className="crbs-field" htmlFor="crbs-character-name">
            <span className="crbs-field-label">Name</span>
            <input
              id="crbs-character-name"
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
              value={props.characterDraft.race}
              onChange={(event) => props.onCharacterFieldChange('race', event.target.value)}
              disabled={props.isCharacterLoading || props.isCharacterSaving}
            />
          </label>
          <label className="crbs-field" htmlFor="crbs-character-class">
            <span className="crbs-field-label">Class</span>
            <input
              id="crbs-character-class"
              type="text"
              className="crbs-input"
              value={props.characterDraft.className}
              onChange={(event) => props.onCharacterFieldChange('className', event.target.value)}
              disabled={props.isCharacterLoading || props.isCharacterSaving}
            />
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
          <label className="crbs-field" htmlFor="crbs-character-avatar">
            <span className="crbs-field-label">Avatar URL</span>
            <input
              id="crbs-character-avatar"
              type="url"
              className="crbs-input"
              value={props.characterDraft.avatarUrl}
              onChange={(event) => props.onCharacterFieldChange('avatarUrl', event.target.value)}
              disabled={props.isCharacterLoading || props.isCharacterSaving}
            />
          </label>
          <label className="crbs-field" htmlFor="crbs-character-level">
            <span className="crbs-field-label">Level</span>
            <input
              id="crbs-character-level"
              type="number"
              min={1}
              max={20}
              className="crbs-input"
              value={props.characterDraft.level}
              onChange={(event) =>
                props.onCharacterFieldChange('level', Number(event.target.value))
              }
              disabled={props.isCharacterLoading || props.isCharacterSaving}
            />
          </label>
        </div>

        <div className="crbs-stats-grid">
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
              <input
                type="number"
                min={1}
                max={30}
                className="crbs-input"
                value={props.characterDraft[field as keyof PlayerSettingsPanel] as number}
                onChange={(event) =>
                  props.onCharacterFieldChange(
                    field as keyof PlayerSettingsPanel,
                    Number(event.target.value)
                  )
                }
                disabled={props.isCharacterLoading || props.isCharacterSaving}
              />
            </label>
          ))}
        </div>

        <div className="crbs-actions">
          <button
            type="button"
            className="session-button"
            disabled={!props.campaignId || props.isCharacterLoading || props.isCharacterSaving}
            onClick={props.onSaveCharacterSettings}
          >
            {props.isCharacterSaving ? 'Saving...' : 'Save character'}
          </button>
        </div>
      </section>
    </div>
  )
}
