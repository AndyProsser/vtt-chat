/**
 * InventoryPanel — character and party inventory for the session workspace.
 * Rehydrates from REST on mount; stays in sync via INVENTORY:* WS events.
 * DM sees all character inventories (one tab per connected player + party).
 * Player sees own + party; Spectator reads all in read-only mode.
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Role, InventoryItemSource, SessionState } from '@shared'
import type { UUID } from '@shared'
import { useStore } from '@/state/store'
import { Icon } from '@/components/ui/Icon'
import '@/styles/components/workspaces/shared/panels/InventoryPanel.css'
import type { InventoryItem, CurrencyWalletState } from '@/types/inventory'
import { InventoryItemRow } from './InventoryPanel.ItemRow'
import { InventoryCurrencyRow } from './InventoryPanel.CurrencyRow'
import { InventoryAddItemForm } from './InventoryPanel.AddItemForm'

export interface InventoryPanelProps {
  campaignId: UUID
  sessionId: UUID
  sessionState: SessionState | null
  currentUserId: UUID
  effectiveSessionRole: Role
  apiUrl: string
  authToken: string
}

interface CharacterTab {
  userId: UUID
  label: string
}

type InventoryView = 'party' | UUID

export function InventoryPanel({
  campaignId,
  sessionId,
  sessionState: _sessionState,
  currentUserId,
  effectiveSessionRole,
  apiUrl,
  authToken,
}: InventoryPanelProps) {
  const [view, setView] = useState<InventoryView>('party')
  const [showAddForm, setShowAddForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hydrateInventory = useStore((state) => state.hydrateInventory)
  const setInventoryLoading = useStore((state) => state.setInventoryLoading)
  const isLoading = useStore((state) => state.inventoryLoading)

  const allItems = useStore((state) => {
    const bucket = state.inventoryItems[campaignId]
    return bucket ? (Object.values(bucket) as InventoryItem[]) : []
  })
  const allWallets = useStore((state) => {
    const bucket = state.currencyWallets[campaignId]
    return bucket ? (Object.values(bucket) as CurrencyWalletState[]) : []
  })

  // Get connected session members for DM character tabs
  const sessionPresenceByUser = useStore(
    (state) => state.sessionPresence[sessionId] ?? {}
  )

  const isReadOnly = effectiveSessionRole === Role.SPECTATOR
  const isDM = effectiveSessionRole === Role.DM

  // Character tabs: DM sees all connected players; Player sees only their own
  const characterTabs = useMemo<CharacterTab[]>(() => {
    if (isDM) {
      return Object.values(sessionPresenceByUser)
        .filter((p) => p.role === Role.PLAYER || p.role === undefined)
        .map((p) => ({
          userId: p.userId as UUID,
          label: p.characterName || p.username,
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    return [{ userId: currentUserId, label: 'My Character' }]
  }, [isDM, sessionPresenceByUser, currentUserId])

  // ─── Fetch on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setInventoryLoading(true)
    setError(null)

    fetch(`${apiUrl}/api/inventory/${campaignId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      })
      .then((data: { items: InventoryItem[]; wallets: CurrencyWalletState[] }) => {
        if (!cancelled) hydrateInventory(campaignId, data.items, data.wallets)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load inventory.')
          setInventoryLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [campaignId, apiUrl, authToken, hydrateInventory, setInventoryLoading])

  // ─── Derived data ─────────────────────────────────────────────────────────
  const currentOwnerId = view === 'party' ? null : (view as UUID)
  const currentOwnerType = view === 'party' ? ('party' as const) : ('character' as const)

  const currentItems = useMemo(
    () =>
      allItems
        .filter(
          (i) =>
            i.ownerType === currentOwnerType &&
            (currentOwnerType === 'party' ? true : i.ownerId === currentOwnerId)
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allItems, currentOwnerType, currentOwnerId]
  )

  const currentWallet = useMemo(
    () =>
      allWallets.find(
        (w) =>
          w.ownerType === currentOwnerType &&
          (currentOwnerType === 'party' ? w.ownerId === null : w.ownerId === currentOwnerId)
      ) ?? null,
    [allWallets, currentOwnerType, currentOwnerId]
  )

  // ─── Mutation helpers ─────────────────────────────────────────────────────
  const removeItem = useCallback(
    async (itemId: UUID) => {
      await fetch(`${apiUrl}/api/inventory/${campaignId}/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    },
    [apiUrl, campaignId, authToken]
  )

  const editItem = useCallback(
    async (itemId: UUID, updates: { name?: string; quantity?: number; notes?: string | null }) => {
      await fetch(`${apiUrl}/api/inventory/${campaignId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    },
    [apiUrl, campaignId, authToken]
  )

  const moveItem = useCallback(
    async (itemId: UUID, toOwnerType: 'party' | 'character', toOwnerId: UUID | null) => {
      await fetch(`${apiUrl}/api/inventory/${campaignId}/items/${itemId}/transfer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ toOwnerType, toOwnerId }),
      })
    },
    [apiUrl, campaignId, authToken]
  )

  const adjustCurrency = useCallback(
    async (delta: Record<string, number>) => {
      await fetch(`${apiUrl}/api/inventory/${campaignId}/currency`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType: currentOwnerType, ownerId: currentOwnerId, delta }),
      })
    },
    [apiUrl, campaignId, authToken, currentOwnerType, currentOwnerId]
  )

  const handleAddItem = useCallback(
    async (name: string, quantity: number, notes: string) => {
      await fetch(`${apiUrl}/api/inventory/${campaignId}/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerType: currentOwnerType,
          ownerId: currentOwnerId,
          name,
          quantity,
          source: InventoryItemSource.CUSTOM,
          notes: notes || undefined,
        }),
      })
      setShowAddForm(false)
    },
    [apiUrl, campaignId, authToken, currentOwnerType, currentOwnerId]
  )

  const switchView = (v: InventoryView) => {
    setView(v)
    setShowAddForm(false)
  }

  // Transfer destinations for the Move To menu
  const moveTargets = useMemo<Array<{ label: string; ownerType: 'party' | 'character'; ownerId: UUID | null }>>(
    () => [
      { label: 'Party', ownerType: 'party', ownerId: null },
      ...characterTabs.map((t) => ({ label: t.label, ownerType: 'character' as const, ownerId: t.userId })),
    ],
    [characterTabs]
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <section className="inventory-panel" aria-label="Inventory">
      <header className="inventory-panel__header">
        <h4 className="inventory-panel__title">
          <Icon name="inventory" />
          Inventory
        </h4>
      </header>

      <div className="inventory-panel__view-tabs" role="tablist" aria-label="Inventory view">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'party'}
          className="inventory-panel__view-tab"
          data-active={view === 'party'}
          onClick={() => switchView('party')}
        >
          Party
        </button>
        {characterTabs.map((tab) => (
          <button
            key={tab.userId}
            type="button"
            role="tab"
            aria-selected={view === tab.userId}
            className="inventory-panel__view-tab"
            data-active={view === tab.userId}
            onClick={() => switchView(tab.userId)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="inventory-panel__state inventory-panel__state--loading" aria-live="polite">
          <Icon name="hourglass" />
          <span>Loading inventory…</span>
        </div>
      ) : error ? (
        <div className="inventory-panel__state inventory-panel__state--error" role="alert">
          <p>{error}</p>
        </div>
      ) : (
        <div className="inventory-panel__body">
          <InventoryCurrencyRow
            wallet={currentWallet}
            isReadOnly={isReadOnly}
            onAdjust={adjustCurrency}
          />

          <div className="inventory-panel__items-header">
            <span className="inventory-panel__items-label">
              Items {currentItems.length > 0 ? `(${currentItems.length})` : ''}
            </span>
            {!isReadOnly && (
              <button
                type="button"
                className="inventory-panel__add-btn"
                aria-label="Add item"
                onClick={() => setShowAddForm((v) => !v)}
              >
                <Icon name="send" />
                Add
              </button>
            )}
          </div>

          {showAddForm && (
            <InventoryAddItemForm onAdd={handleAddItem} onCancel={() => setShowAddForm(false)} />
          )}

          {currentItems.length === 0 && !showAddForm ? (
            <p className="inventory-panel__empty">No items yet.</p>
          ) : (
            <ul className="inventory-panel__item-list" aria-label="Inventory items">
              {currentItems.map((item) => (
                <InventoryItemRow
                  key={item.id}
                  item={item}
                  isReadOnly={isReadOnly}
                  onRemove={removeItem}
                  onEdit={editItem}
                  onMove={moveItem}
                  moveTargets={moveTargets.filter(
                    (t) => !(t.ownerType === item.ownerType && t.ownerId === item.ownerId)
                  )}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
