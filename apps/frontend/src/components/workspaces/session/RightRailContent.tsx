import { memo } from 'react'
import type { ReactNode } from 'react'
import type { RightRailTab } from '@/types/ui'

interface RightRailContentProps {
  tab: RightRailTab
  informationPanel: ReactNode
  partyPanel: ReactNode
  inventoryPanel: ReactNode
  roomsPanel: ReactNode
  notesPanel: ReactNode
  journalPanel: ReactNode
  historyPanel: ReactNode
  settingsPanel: ReactNode
}

export const RightRailContent = memo(function RightRailContent({
  tab,
  informationPanel,
  partyPanel,
  inventoryPanel,
  roomsPanel,
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
    case 'inventory':
      return <>{inventoryPanel}</>
    case 'rooms':
      return <>{roomsPanel}</>
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
})
