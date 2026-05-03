import type { ToolbarActionModel } from './CommandCenterFrame'
import type { Role, SessionState } from '@shared'
import type { ConnectionState } from '../../ws/client'
import { Tabs, TabsList, TabsTrigger } from '../../core-ui'
import { Icon } from '../ui/Icon'

interface SessionToolbarProps {
  actions: ToolbarActionModel
  username: string
  role: Role
  wsState: ConnectionState
  sessionState: SessionState
  canStartSession: boolean
  canStopSession: boolean
  onStartSession: () => void
  onStopSession: () => void
  onExitToSelector: () => void
}

export function SessionToolbar({
  actions,
  username,
  role,
  wsState,
  sessionState,
  canStartSession,
  canStopSession,
  onStartSession,
  onStopSession,
  onExitToSelector,
}: SessionToolbarProps) {
  return (
    <div className="space-y-2" data-testid="session-toolbar">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ui-secondary">
        <span className="inline-flex items-center gap-1 rounded-ui-sm border border-ui-border px-2 py-1">
          <strong className="text-ui-primary">{username}</strong> ({role})
        </span>
        <span className="inline-flex items-center gap-1 rounded-ui-sm border border-ui-border px-2 py-1">
          WS: <strong className="text-ui-primary">{wsState}</strong>
        </span>
        <span className="inline-flex items-center gap-1 rounded-ui-sm border border-ui-border px-2 py-1">
          Session: <strong className="text-ui-primary">{sessionState}</strong>
        </span>
      </div>

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
              <span className="inline-flex items-center gap-1">
                <Icon name="chat" /> Chat
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              aria-label="Center Notes"
              className="rounded-ui-sm px-3 py-1 text-xs text-ui-secondary data-[state=active]:bg-ui-surface data-[state=active]:text-ui-primary"
            >
              <span className="inline-flex items-center gap-1">
                <Icon name="notes" /> Notes
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {canStartSession ? (
          <button
            type="button"
            onClick={onStartSession}
            className="rounded-ui-sm bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700"
          >
            Start Session
          </button>
        ) : null}

        {canStopSession ? (
          <button
            type="button"
            onClick={onStopSession}
            className="rounded-ui-sm bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-700"
          >
            Stop Session
          </button>
        ) : null}

        <button
          type="button"
          onClick={onExitToSelector}
          className="rounded-ui-sm border border-ui-border bg-ui-surface px-3 py-1 text-xs text-ui-primary hover:bg-ui-surface-subtle"
        >
          Exit To Campaign Selector
        </button>

        <span className="inline-flex items-center gap-1 rounded-ui-sm border border-ui-border-soft bg-ui-surface-subtle px-2 py-1 text-xs text-ui-secondary">
          <Icon name="settings" /> Tools: {actions.activeRightRailTab}
        </span>
      </div>
    </div>
  )
}
