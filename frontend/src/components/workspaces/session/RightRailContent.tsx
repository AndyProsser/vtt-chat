import type { ReactNode } from 'react'
import type { RightRailTab } from '@/components/workspaces/shared/toolbar/SessionWorkspaceFrame'

interface RightRailContentProps {
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

export function RightRailContent({
  tab,
  informationPanel,
  partyPanel,
  roomsPanel,
  audioPanel,
  notesPanel,
  journalPanel,
  historyPanel,
  settingsPanel,
}: RightRailContentProps) {
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
