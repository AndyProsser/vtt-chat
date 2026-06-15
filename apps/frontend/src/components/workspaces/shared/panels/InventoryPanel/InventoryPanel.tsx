/** InventoryPanel — character and party inventory for the session workspace.
 * Renders character inventories, the party purse, and currency wallets.
 * Rehydrates from REST on mount; kept in sync via INVENTORY:* WS events.
 */
import type { Role, SessionState, UUID } from '@shared'
import { Icon } from '@/components/ui/Icon'
import '@/styles/components/workspaces/shared/panels/InventoryPanel.css'

export interface InventoryPanelProps {
  campaignId: UUID
  sessionId: UUID
  sessionState: SessionState | null
  currentUserId: UUID
  effectiveSessionRole: Role
  apiUrl: string
  authToken: string
}

export function InventoryPanel({
  campaignId: _campaignId,
  sessionId: _sessionId,
  sessionState: _sessionState,
  currentUserId: _currentUserId,
  effectiveSessionRole: _effectiveSessionRole,
  apiUrl: _apiUrl,
  authToken: _authToken,
}: InventoryPanelProps) {
  return (
    <section className="inventory-panel" aria-label="Inventory">
      <header className="inventory-panel__header">
        <h4 className="inventory-panel__title">
          <Icon name="inventory" />
          Inventory
        </h4>
      </header>
      <div className="inventory-panel__coming-soon">
        <Icon name="inventory" className="inventory-panel__coming-soon-icon" />
        <p className="inventory-panel__coming-soon-label">Coming soon</p>
        <p className="inventory-panel__coming-soon-sub">
          Character and party inventory with SRD item search.
        </p>
      </div>
    </section>
  )
}
