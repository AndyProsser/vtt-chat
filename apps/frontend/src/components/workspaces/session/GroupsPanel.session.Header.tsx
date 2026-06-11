import { Icon } from '@/components/ui/Icon'

interface GroupsPanelSessionHeaderProps {
  canCreate: boolean
  isCreating: boolean
  newGroupName: string
  onNameChange: (name: string) => void
  onCreateGroup: () => void
}

export function GroupsPanelSessionHeader({
  canCreate,
  isCreating,
  newGroupName,
  onNameChange,
  onCreateGroup,
}: GroupsPanelSessionHeaderProps) {
  return (
    <header className="session-groups-panel__header">
      <div className="session-groups-panel__header-info">
        <h3 className="session-groups-panel__title">
          <Icon name="rooms" />
          Groups
        </h3>
      </div>
      {canCreate ? (
        <div className="session-groups-panel__create-row">
          <input
            type="text"
            value={newGroupName}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="New group name"
            className="session-groups-panel__create-input"
            disabled={isCreating}
          />
          <button
            type="button"
            className="session-groups-panel__create-button"
            onClick={onCreateGroup}
            disabled={isCreating || !newGroupName.trim()}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              group_add
            </span>
          </button>
        </div>
      ) : null}
    </header>
  )
}
