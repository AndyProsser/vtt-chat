import { Slider } from '@/components/ui'

interface InviteJoinCharacterFormProps {
  characterName: string
  characterRace: string
  characterClass: string
  characterLevel: number
  characterAvatarUrl: string
  showCharacterDetails: boolean
  onCharacterNameChange: (value: string) => void
  onCharacterRaceChange: (value: string) => void
  onCharacterClassChange: (value: string) => void
  onCharacterLevelChange: (value: number) => void
  onAvatarSelected: (event: React.ChangeEvent<HTMLInputElement>) => void
  onToggleDetails: () => void
}

export function InviteJoinCharacterForm({
  characterName,
  characterRace,
  characterClass,
  characterLevel,
  characterAvatarUrl,
  showCharacterDetails,
  onCharacterNameChange,
  onCharacterRaceChange,
  onCharacterClassChange,
  onCharacterLevelChange,
  onAvatarSelected,
  onToggleDetails,
}: InviteJoinCharacterFormProps) {
  return (
    <>
      <button
        type="button"
        className="invite-join-disclosure"
        onClick={onToggleDetails}
        aria-expanded={showCharacterDetails}
      >
        {showCharacterDetails
          ? 'Hide optional character details'
          : 'Show optional character details'}
      </button>

      {showCharacterDetails && (
        <div className="invite-join-character-grid">
          <p className="invite-join-character-grid__title">Optional</p>

          <label htmlFor="join-character-name">Character name</label>
          <input
            id="join-character-name"
            type="text"
            value={characterName}
            onChange={(event) => onCharacterNameChange(event.target.value)}
          />

          <label htmlFor="join-character-race">Race</label>
          <input
            id="join-character-race"
            type="text"
            value={characterRace}
            onChange={(event) => onCharacterRaceChange(event.target.value)}
          />

          <label htmlFor="join-character-class">Class</label>
          <input
            id="join-character-class"
            type="text"
            value={characterClass}
            onChange={(event) => onCharacterClassChange(event.target.value)}
          />

          <label htmlFor="join-character-level">Level</label>
          <Slider
            id="join-character-level"
            className="invite-join-level-slider"
            min={1}
            max={20}
            step={1}
            value={characterLevel}
            onValueChange={(nextValue) => onCharacterLevelChange(nextValue || 1)}
          />
          <output className="invite-join-level-output" htmlFor="join-character-level">
            Level {characterLevel}
          </output>

          <label htmlFor="join-character-avatar">Avatar upload</label>
          <input
            id="join-character-avatar"
            type="file"
            accept="image/*"
            onChange={onAvatarSelected}
          />

          {characterAvatarUrl ? (
            <img
              src={characterAvatarUrl}
              alt="Character avatar preview"
              className="invite-join-avatar-preview"
            />
          ) : null}
        </div>
      )}
    </>
  )
}
