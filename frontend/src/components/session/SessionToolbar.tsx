import type { ToolbarActionModel } from './CommandCenterFrame'

interface SessionToolbarProps {
  actions: ToolbarActionModel
}

export function SessionToolbar({ actions }: SessionToolbarProps) {
  return (
    <div className="session-toolbar" data-testid="session-toolbar">
      <h4 className="session-toolbar-title">Toolbar</h4>
      <p className="session-toolbar-subtitle">Stage 9.1 action model</p>

      <div className="session-toolbar-primary-actions">
        <button
          type="button"
          aria-label="Center Chat"
          aria-pressed={actions.centerPaneView === 'chat'}
          onClick={() => actions.setCenterPaneView('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          aria-label="Center Notes"
          aria-pressed={actions.centerPaneView === 'notes'}
          onClick={() => actions.setCenterPaneView('notes')}
        >
          Notes
        </button>
        <button type="button" onClick={actions.toggleRightRail}>
          {actions.rightRailOpen ? 'Hide Tools' : 'Show Tools'}
        </button>
      </div>

      <div className="session-toolbar-secondary-actions">
        {actions.placeholderActions.map((action) => (
          <button key={action.id} type="button" disabled title="Planned in future Stage 9 work">
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
