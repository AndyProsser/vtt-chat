/**
 * InventoryPanel — character and party inventory for the session workspace.
 * Rehydrates from REST on mount; stays in sync via INVENTORY:* WS events.
 * DM sees all character inventories; Player sees own + party; Spectator reads all.
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Role, InventoryItemSource } from '@shared'
import type { SessionState, UUID } from '@shared'
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

  const isReadOnly = effectiveSessionRole === Role.SPECTATOR
  const isDM = effectiveSessionRole === Role.DM

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

    return () => {
      cancelled = true
    }
  }, [campaignId, apiUrl, authToken, hydrateInventory, setInventoryLoading])

  // ─── Derived data ─────────────────────────────────────────────────────────
  const partyItems = useMemo(
    () => allItems.filter((i) => i.ownerType === 'party').sort((a, b) => a.name.localeCompare(b.name)),
    [allItems]
  )
  const myItems = useMemo(
    () =>
      allItems
        .filter((i) => i.ownerType === 'character' && i.ownerId === currentUserId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allItems, currentUserId]
  )
  const partyWallet = useMemo(
    () => allWallets.find((w) => w.ownerType === 'party') ?? null,
    [allWallets]
  )
  const myWallet = useMemo(
    () => allWallets.find((w) => w.ownerType === 'character' && w.ownerId === currentUserId) ?? null,
    [allWallets, currentUserId]
  )

  const currentItems = view === 'party' ? partyItems : myItems
  const currentWallet = view === 'party' ? partyWallet : myWallet
  const currentOwnerId = view === 'party' ? null : currentUserId
  const currentOwnerType = view === 'party' ? ('party' as const) : ('character' as const)

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

  const handleAddItem = useCallback(
    async (name: string, quantity: number, notes: string) => {
      await fetch(`${apiUrl}/api/inventory/${campaignId}/items`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
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
          onClick={() => { setView('party'); setShowAddForm(false) }}
        >
          Party
        </button>
        {!isDM && (
          <button
            type="button"
            role="tab"
            aria-selected={view === currentUserId}
            className="inventory-panel__view-tab"
            data-active={view === currentUserId}
            onClick={() => { setView(currentUserId); setShowAddForm(false) }}
          >
            My Character
          </button>
        )}
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
          <InventoryCurrencyRow wallet={currentWallet} isReadOnly={isReadOnly} />

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
                  apiUrl={apiUrl}
                  authToken={authToken}
                  campaignId={campaignId}
                  sessionId={sessionId}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
