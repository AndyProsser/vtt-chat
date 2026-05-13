import '../../styles/components/session/CampaignRightbarSettings.css'

export interface CharacterSettingsDraft {
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

export interface CampaignRightbarSettingsProps {
  role: 'DM' | 'PLAYER' | 'SPECTATOR'
  campaignId: string | null
  sessionName: string
  sessionDescription: string
  plannedDurationMinutes: number
  sessionStateLabel: string
  canEditSessionSettings: boolean
  onSessionNameChange: (value: string) => void
  onSessionDescriptionChange: (value: string) => void
  onPlannedDurationMinutesChange: (value: number) => void
  onSaveSessionSettings: () => void
  isSessionSaving: boolean
  /** DM auto-target toggle value */
  dmAutoTarget: boolean
  onDmAutoTargetChange: (value: boolean) => void
  onSaveDmAutoTarget: () => void
  isSaving: boolean
  isLoading: boolean
  characterDraft: CharacterSettingsDraft
  onCharacterFieldChange: (field: keyof CharacterSettingsDraft, value: string | number) => void
  onSaveCharacterSettings: () => void
  isCharacterLoading: boolean
  isCharacterSaving: boolean
}

export function CampaignRightbarSettings({
  role,
  campaignId,
  sessionName,
  sessionDescription,
  plannedDurationMinutes,
  sessionStateLabel,
  canEditSessionSettings,
  onSessionNameChange,
  onSessionDescriptionChange,
  onPlannedDurationMinutesChange,
  onSaveSessionSettings,
  isSessionSaving,
  dmAutoTarget,
  onDmAutoTargetChange,
  onSaveDmAutoTarget,
  isSaving,
  isLoading,
  characterDraft,
  onCharacterFieldChange,
  onSaveCharacterSettings,
  isCharacterLoading,
  isCharacterSaving,
}: CampaignRightbarSettingsProps) {
  const isDm = role === 'DM'
  const canEditCharacter = role === 'DM' || role === 'PLAYER'

  return (
    <div className="crbs-panel" aria-label="Campaign settings">
      {isDm && (
        <>
          <h3 className="crbs-heading">Campaign Settings</h3>

          <section className="crbs-section">
            <h4 className="crbs-section-heading">Session</h4>
            <p className="crbs-description">State: {sessionStateLabel}</p>

            <label className="crbs-field" htmlFor="crbs-session-name">
              <span className="crbs-field-label">Session name</span>
              <input
                id="crbs-session-name"
                type="text"
                className="crbs-input"
                value={sessionName}
                onChange={(event) => onSessionNameChange(event.target.value)}
                disabled={!canEditSessionSettings || isSessionSaving}
              />
            </label>

            <label className="crbs-field" htmlFor="crbs-session-description">
              <span className="crbs-field-label">Session description</span>
              <textarea
                id="crbs-session-description"
                className="crbs-textarea"
                value={sessionDescription}
                onChange={(event) => onSessionDescriptionChange(event.target.value)}
                disabled={!canEditSessionSettings || isSessionSaving}
              />
            </label>

            <label className="crbs-field" htmlFor="crbs-session-duration">
              <span className="crbs-field-label">Planned duration (minutes)</span>
              <input
                id="crbs-session-duration"
                type="number"
                min={15}
                max={720}
                step={15}
                className="crbs-input"
                value={plannedDurationMinutes}
                onChange={(event) => onPlannedDurationMinutesChange(Number(event.target.value))}
                disabled={!canEditSessionSettings || isSessionSaving}
              />
            </label>

            <div className="crbs-actions">
              <button
                type="button"
                className="session-button"
                disabled={!campaignId || !canEditSessionSettings || isSessionSaving}
                onClick={onSaveSessionSettings}
              >
                {isSessionSaving ? 'Saving…' : 'Save session settings'}
              </button>
            </div>
            {!canEditSessionSettings ? (
              <p className="crbs-muted">
                Session settings are editable only while inactive, active, or paused.
              </p>
            ) : null}
          </section>

          <section className="crbs-section">
            <h4 className="crbs-section-heading">Voice Targeting</h4>
            <p className="crbs-description">
              Automatically switch DM voice target to a group when the first player joins it.
            </p>

            <label className="crbs-toggle" htmlFor="crbs-auto-target">
              <input
                id="crbs-auto-target"
                type="checkbox"
                checked={dmAutoTarget}
                disabled={isLoading || isSaving}
                onChange={(e) => onDmAutoTargetChange(e.target.checked)}
              />
              <span>Auto-target on first player join</span>
            </label>

            <div className="crbs-actions">
              <button
                type="button"
                className="session-button"
                disabled={!campaignId || isLoading || isSaving}
                onClick={onSaveDmAutoTarget}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </section>
        </>
      )}

      {role !== 'DM' && (
        <>
          <h3 className="crbs-heading">Character</h3>

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
                  value={characterDraft.name}
                  onChange={(event) => onCharacterFieldChange('name', event.target.value)}
                  disabled={!canEditCharacter || isCharacterLoading || isCharacterSaving}
                />
              </label>
              <label className="crbs-field" htmlFor="crbs-character-race">
                <span className="crbs-field-label">Race</span>
                <input
                  id="crbs-character-race"
                  type="text"
                  className="crbs-input"
                  value={characterDraft.race}
                  onChange={(event) => onCharacterFieldChange('race', event.target.value)}
                  disabled={!canEditCharacter || isCharacterLoading || isCharacterSaving}
                />
              </label>
              <label className="crbs-field" htmlFor="crbs-character-class">
                <span className="crbs-field-label">Class</span>
                <input
                  id="crbs-character-class"
                  type="text"
                  className="crbs-input"
                  value={characterDraft.className}
                  onChange={(event) => onCharacterFieldChange('className', event.target.value)}
                  disabled={!canEditCharacter || isCharacterLoading || isCharacterSaving}
                />
              </label>
              <label className="crbs-field" htmlFor="crbs-character-subclass">
                <span className="crbs-field-label">Subclass</span>
                <input
                  id="crbs-character-subclass"
                  type="text"
                  className="crbs-input"
                  value={characterDraft.subclass}
                  onChange={(event) => onCharacterFieldChange('subclass', event.target.value)}
                  disabled={!canEditCharacter || isCharacterLoading || isCharacterSaving}
                />
              </label>
              <label className="crbs-field" htmlFor="crbs-character-avatar">
                <span className="crbs-field-label">Avatar URL</span>
                <input
                  id="crbs-character-avatar"
                  type="url"
                  className="crbs-input"
                  value={characterDraft.avatarUrl}
                  onChange={(event) => onCharacterFieldChange('avatarUrl', event.target.value)}
                  disabled={!canEditCharacter || isCharacterLoading || isCharacterSaving}
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
                  value={characterDraft.level}
                  onChange={(event) => onCharacterFieldChange('level', Number(event.target.value))}
                  disabled={!canEditCharacter || isCharacterLoading || isCharacterSaving}
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
                    value={characterDraft[field as keyof CharacterSettingsDraft] as number}
                    onChange={(event) =>
                      onCharacterFieldChange(
                        field as keyof CharacterSettingsDraft,
                        Number(event.target.value)
                      )
                    }
                    disabled={!canEditCharacter || isCharacterLoading || isCharacterSaving}
                  />
                </label>
              ))}
            </div>

            {canEditCharacter ? (
              <div className="crbs-actions">
                <button
                  type="button"
                  className="session-button"
                  disabled={!campaignId || isCharacterLoading || isCharacterSaving}
                  onClick={onSaveCharacterSettings}
                >
                  {isCharacterSaving ? 'Saving…' : 'Save character'}
                </button>
              </div>
            ) : (
              <p className="crbs-muted">Character settings are read-only for spectators.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
