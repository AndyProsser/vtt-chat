import { useEffect, useRef } from 'react'
import type { CharacterClassEntry } from '@shared'
import { Icon } from '@/components/ui/Icon'
import { CharacterAvatarUploadField } from './CharacterAvatarUploadField'
import { VerticalSliderInput } from './VerticalSliderInput'
import { useSrdOptions } from '@/hooks/useSrdOptions'
import '@/styles/components/workspaces/shared/panels/WorkspaceSettingsPanel.css'

export interface PlayerSettingsPanel {
  name: string
  race: string
  /** Primary class name in merged format, e.g. "Fighter / Battle Master". Mirrors classes[0].name. */
  className: string
  /** All class entries. classes[0] is always the primary class; never removable. */
  classes: CharacterClassEntry[]
  avatarUrl: string
  /** Total level. For multiclass characters this equals sum of classes[n].level. */
  level: number
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
  /** Stored when synced from extension; not shown as an editable field. */
  hpCurrent: number
  hpMax: number
  ac: number
  initiative: number
  passivePerception: number
  speed: number
}

export interface PlayerSettingsPanelProps {
  campaignId: string | null
  characterDraft: PlayerSettingsPanel
  onCharacterFieldChange: (field: keyof PlayerSettingsPanel, value: string | number) => void
  onClassesChange?: (classes: CharacterClassEntry[]) => void
  onSaveCharacterSettings: () => void
  isCharacterLoading: boolean
  isCharacterSaving: boolean
  focusRequestKey?: number
  /** Campaign-level D&D edition for SRD lookups; defaults to 2024. */
  dndRuleset?: '2014' | '2024'
  apiUrl?: string
  token?: string
  /** Called when race/class/subclass gains focus — suppresses auto-save while popup is open. */
  onSrdFieldFocus?: () => void
  /** Called when race/class/subclass loses focus — triggers deferred save. */
  onSrdFieldBlur?: () => void
}

const EMPTY_CLASSES: CharacterClassEntry[] = [{ name: 'Fighter', level: 1 }]

export function PlayerSettingsPanel(props: PlayerSettingsPanelProps) {
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const disabled = props.isCharacterLoading || props.isCharacterSaving

  useEffect(() => {
    if (typeof props.focusRequestKey !== 'number') {
      return
    }

    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [props.focusRequestKey])

  const classes = props.characterDraft.classes?.length
    ? props.characterDraft.classes
    : EMPTY_CLASSES
  const isMulticlass = classes.length > 1
  const primaryClass = classes[0]

  const { raceOptions, classOptions } = useSrdOptions({
    apiUrl: props.apiUrl ?? '',
    token: props.token ?? '',
    ruleset: props.dndRuleset ?? '2024',
    selectedClass: primaryClass?.name ?? '',
  })

  function handlePrimaryClassChange(name: string) {
    const next: CharacterClassEntry[] = [{ ...primaryClass, name }, ...classes.slice(1)]
    props.onClassesChange?.(next)
  }

  function handleClassLevelChange(index: number, level: number) {
    const next = classes.map((c, i) => (i === index ? { ...c, level } : c))
    props.onClassesChange?.(next)
  }

  function handleAddClass() {
    const next: CharacterClassEntry[] = [...classes, { name: 'Fighter', level: 1 }]
    props.onClassesChange?.(next)
  }

  function handleRemoveClass(index: number) {
    if (index === 0) return
    const next = classes.filter((_, i) => i !== index)
    props.onClassesChange?.(next)
  }

  function handleSecondaryClassChange(index: number, name: string) {
    const next = classes.map((c, i) => (i === index ? { ...c, name } : c))
    props.onClassesChange?.(next)
  }

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
          disabled={!props.campaignId || disabled}
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
                disabled={disabled}
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
                onFocus={props.onSrdFieldFocus}
                onBlur={props.onSrdFieldBlur}
                disabled={disabled}
              />
              <datalist id="crbs-character-race-suggestions">
                {raceOptions.map((race) => (
                  <option key={race} value={race} />
                ))}
              </datalist>
            </label>
            <div className="crbs-field crbs-field--span">
              <span className="crbs-field-label">
                {isMulticlass ? 'Classes' : 'Class / Subclass'}
              </span>
              <datalist id="crbs-character-class-suggestions">
                {classOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {!isMulticlass ? (
                <div className="crbs-class-input-row">
                  <input
                    id="crbs-character-class"
                    type="text"
                    className="crbs-input"
                    list="crbs-character-class-suggestions"
                    placeholder="e.g. Fighter / Battle Master"
                    value={primaryClass?.name ?? ''}
                    onChange={(event) => handlePrimaryClassChange(event.target.value)}
                    onFocus={props.onSrdFieldFocus}
                    onBlur={props.onSrdFieldBlur}
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    className="crbs-class-action-btn"
                    aria-label="Add secondary class"
                    disabled={disabled}
                    onClick={handleAddClass}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      add
                    </span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="crbs-class-row">
                    <input
                      id="crbs-character-class"
                      type="text"
                      className="crbs-input"
                      list="crbs-character-class-suggestions"
                      placeholder="e.g. Fighter / Battle Master"
                      value={primaryClass?.name ?? ''}
                      onChange={(event) => handlePrimaryClassChange(event.target.value)}
                      onFocus={props.onSrdFieldFocus}
                      onBlur={props.onSrdFieldBlur}
                      disabled={disabled}
                      aria-label="Primary class"
                    />
                    <VerticalSliderInput
                      label="Primary class level (1–20)"
                      min={1}
                      max={20}
                      value={primaryClass?.level ?? 1}
                      onChange={(v) => handleClassLevelChange(0, v)}
                      disabled={disabled}
                      triggerMode="click"
                    />
                    <button
                      type="button"
                      className="crbs-class-action-btn"
                      aria-label="Add secondary class"
                      disabled={disabled || classes.length >= 5}
                      onClick={handleAddClass}
                    >
                      <span className="material-symbols-outlined" aria-hidden="true">
                        add
                      </span>
                    </button>
                  </div>
                  {classes.slice(1).map((entry, sliceIndex) => {
                    const index = sliceIndex + 1
                    return (
                      <div key={index} className="crbs-class-row">
                        <input
                          type="text"
                          className="crbs-input"
                          placeholder="e.g. Warlock / Great Old One"
                          value={entry.name}
                          onChange={(e) => handleSecondaryClassChange(index, e.target.value)}
                          disabled={disabled}
                          aria-label={`Secondary class ${index}`}
                        />
                        <VerticalSliderInput
                          label={`Class ${index + 1} level (1–20)`}
                          min={1}
                          max={20}
                          value={entry.level}
                          onChange={(v) => handleClassLevelChange(index, v)}
                          disabled={disabled}
                          triggerMode="click"
                        />
                        <button
                          type="button"
                          className="crbs-class-action-btn crbs-class-action-btn--remove"
                          aria-label={`Remove ${entry.name || 'secondary class'}`}
                          disabled={disabled}
                          onClick={() => handleRemoveClass(index)}
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">
                            remove
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </div>

          <div className="crbs-attributes-row">
            <label className="crbs-field crbs-field--level" htmlFor="crbs-character-level">
              <span className="crbs-field-label">Level</span>
              {isMulticlass ? (
                <input
                  id="crbs-character-level"
                  type="number"
                  className="crbs-input crbs-input--readonly"
                  value={props.characterDraft.level}
                  readOnly
                  aria-label="Total character level (sum of all classes)"
                />
              ) : (
                <VerticalSliderInput
                  id="crbs-character-level"
                  label="Level (1–20)"
                  min={1}
                  max={20}
                  value={props.characterDraft.level}
                  onChange={(v) => props.onCharacterFieldChange('level', v)}
                  disabled={disabled}
                  triggerMode="click"
                />
              )}
            </label>

            <div className="crbs-stats-strip" role="group" aria-label="Ability scores">
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
                    disabled={disabled}
                    triggerMode="click"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <span className="crbs-field-label">Combat Stats</span>
        <div
          className="crbs-stats-strip crbs-stats-strip--5col"
          role="group"
          aria-label="Combat stats"
        >
          {(
            [
              ['hpMax', 'HP', 0, 999],
              ['ac', 'AC', 0, 30],
              ['initiative', 'INIT', -10, 20],
              ['passivePerception', 'PP', 1, 30],
              ['speed', 'SPD', 0, 120],
            ] as const
          ).map(([field, label, min, max]) => (
            <label key={field} className="crbs-field crbs-field--stat">
              <span className="crbs-field-label">{label}</span>
              <VerticalSliderInput
                label={`${label} (${min}–${max})`}
                min={min}
                max={max}
                value={props.characterDraft[field] as number}
                onChange={(v) => props.onCharacterFieldChange(field, v)}
                disabled={disabled}
                triggerMode="click"
              />
            </label>
          ))}
        </div>

        <CharacterAvatarUploadField
          value={props.characterDraft.avatarUrl}
          onChange={(value) => props.onCharacterFieldChange('avatarUrl', value)}
          disabled={disabled}
        />
      </section>
    </div>
  )
}
