import type { ToolbarActionModel } from './CommandCenterFrame'
import { Tabs, TabsList, TabsTrigger } from '../../core-ui'

interface SessionToolbarProps {
  actions: ToolbarActionModel
}

export function SessionToolbar({ actions }: SessionToolbarProps) {
  return (
    <div className="space-y-2" data-testid="session-toolbar">
      <h4 className="m-0 text-base font-semibold text-ui-primary">Toolbar</h4>
      <p className="m-0 text-xs text-ui-secondary">Stage 9.1 action model</p>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={actions.centerPaneView}
          onValueChange={(value) => {
            if (value === 'chat' || value === 'notes') {
              actions.setCenterPaneView(value)
            }
          }}
        >
          <TabsList className="h-auto gap-1 rounded-ui-md bg-ui-surface-subtle p-1">
            <TabsTrigger
              value="chat"
              aria-label="Center Chat"
              className="rounded-ui-sm px-3 py-1 text-xs text-ui-secondary data-[state=active]:bg-ui-surface data-[state=active]:text-ui-primary"
            >
              Chat
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              aria-label="Center Notes"
              className="rounded-ui-sm px-3 py-1 text-xs text-ui-secondary data-[state=active]:bg-ui-surface data-[state=active]:text-ui-primary"
            >
              Notes
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <button
          type="button"
          onClick={actions.toggleRightRail}
          className="rounded-ui-sm border border-ui-border bg-ui-surface px-3 py-1 text-xs text-ui-primary hover:bg-ui-surface-subtle"
        >
          {actions.rightRailOpen ? 'Hide Tools' : 'Show Tools'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.placeholderActions.map((action) => (
          <button
            key={action.id}
            type="button"
            disabled
            title="Planned in future Stage 9 work"
            className="cursor-not-allowed rounded-ui-sm border border-ui-border-soft bg-ui-surface-subtle px-2 py-1 text-xs text-ui-secondary"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
