import type { ReactNode } from 'react'
import type { RightRailTab } from '@/components/app/workspaces/shared/toolbar/SessionWorkspaceFrame'

interface SessionRightRailContentProps {
  tab: RightRailTab
  informationPanel: ReactNode
  partyPanel: ReactNode
  roomsPanel: ReactNode
  audioPanel: ReactNode
  notesPanel: ReactNode
  journalPanel: ReactNode
  historyPanel: ReactNode
  settingsPanel: ReactNode
}

export function SessionRightRailContent({
  tab,
  informationPanel,
  partyPanel,
  roomsPanel,
  audioPanel,
  notesPanel,
  journalPanel,
  historyPanel,
  settingsPanel,
}: SessionRightRailContentProps) {
  switch (tab) {
    case 'information':
      return <>{informationPanel}</>
    case 'party':
      return <>{partyPanel}</>
    case 'rooms':
      return <>{roomsPanel}</>
    case 'audio':
      return <>{audioPanel}</>
    case 'notes':
      return <>{notesPanel}</>
    case 'journal':
      return <>{journalPanel}</>
    case 'history':
      return <>{historyPanel}</>
    case 'settings':
      return <>{settingsPanel}</>
    default:
      return <p className="session-placeholder-copy">Tool panel is not available for this tab.</p>
  }
}
