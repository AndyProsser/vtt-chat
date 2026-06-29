/**
 * InventoryPanel — character and party inventory for the session workspace.
 * Rehydrates from REST on mount; stays in sync via INVENTORY:* WS events.
 *
 * Role-based tab behaviour:
 *   Player    → "Mine" (default) + "Party" tabs
 *   DM        → horizontal avatar-strip picker (Party + all characters; default Party)
 *   Spectator → Party only, read-only
 *
 * Items are grouped into container sections; top-level (uncontainerised) items
 * appear below all container sections. See docs/subsystems/INVENTORY-SYSTEM.md §5.2
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Role, InventoryItemSource, InventoryItemCategory, SessionState } from '@shared'
import type { UUID } from '@shared'
import { useStore } from '@/state/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import '@/styles/components/workspaces/shared/panels/InventoryPanel.css'
import type { InventoryItem, CurrencyWalletState } from '@/types/inventory'
import { InventoryItemRow } from './InventoryPanel.ItemRow'
import { ContainerSection } from './InventoryPanel.ContainerSection'
import { InventoryCurrencyRow } from './InventoryPanel.CurrencyRow'
import type { CurrencyTransferTarget } from './InventoryPanel.CurrencyRow'
import { InventoryAddItemForm } from './InventoryPanel.AddItemForm'
import { InventoryHistoryOverlay } from './InventoryPanel.History'
import { InventoryCharacterPicker } from './InventoryPanel.CharacterPicker'
import type { CharacterPickerMember } from './InventoryPanel.CharacterPicker'

export interface InventoryPanelProps {
  campaignId: UUID
  sessionId: UUID
  sessionState: SessionState | null
  currentUserId: UUID
  effectiveSessionRole: Role
  apiUrl: string
  authToken: string
  dndRuleset?: '2014' | '2024'
}

type InventoryView = 'party' | UUID

// Stable fallbacks — must live outside the component to avoid Zustand snapshot loops
const EMPTY_ITEMS: InventoryItem[] = []
const EMPTY_WALLETS: CurrencyWalletState[] = []
const EMPTY_PRESENCE: Record<string, never> = {}

interface CampaignPlayerProfile {
  userId: UUID
  label: string
  avatarUrl: string | null
}

const EMPTY_PROFILES: CampaignPlayerProfile[] = []

export function InventoryPanel({
  campaignId,
  sessionId,
  sessionState: _sessionState,
  currentUserId,
  effectiveSessionRole,
  apiUrl,
  authToken,
  dndRuleset = '2024',
}: InventoryPanelProps) {
  const isReadOnly = effectiveSessionRole === Role.SPECTATOR
  const isDM = effectiveSessionRole === Role.DM
  const isPlayer = effectiveSessionRole === Role.PLAYER

  const defaultView: InventoryView = isPlayer ? currentUserId : 'party'
  const [view, setView] = useState<InventoryView>(defaultView)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showOfflinePlayers, setShowOfflinePlayers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playerProfiles, setPlayerProfiles] = useState<CampaignPlayerProfile[]>(EMPTY_PROFILES)
  const [draggingItemId, setDraggingItemId] = useState<UUID | null>(null)
  const [topLevelDragOver, setTopLevelDragOver] = useState(false)

  const hydrateInventory = useStore((state) => state.hydrateInventory)
  const setInventoryLoading = useStore((state) => state.setInventoryLoading)
  const isLoading = useStore((state) => state.inventoryLoading)

  const itemsBucket = useStore((state) => state.inventoryItems[campaignId])
  const walletsBucket = useStore((state) => state.currencyWallets[campaignId])

  const allItems = useMemo(
    () => (itemsBucket ? (Object.values(itemsBucket) as InventoryItem[]) : EMPTY_ITEMS),
    [itemsBucket]
  )
  const allWallets = useMemo(
    () => (walletsBucket ? (Object.values(walletsBucket) as CurrencyWalletState[]) : EMPTY_WALLETS),
    [walletsBucket]
  )

  const sessionPresenceByUser = useStore(
    (state) => state.sessionPresence[sessionId] ?? EMPTY_PRESENCE
  )

  // ─── Fetch inventory + campaign player profiles on mount ──────────────────
  useEffect(() => {
    let cancelled = false
    setInventoryLoading(true)
    setError(null)

    const headers = { Authorization: `Bearer ${authToken}` }

    const fetchInventory = fetch(`${apiUrl}/api/inventory/${campaignId}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json()
      })
      .then((data: { items: InventoryItem[]; wallets: CurrencyWalletState[] }) => {
        if (!cancelled) hydrateInventory(campaignId, data.items, data.wallets)
      })

    const fetchProfiles = !isReadOnly
      ? fetch(`${apiUrl}/api/campaigns/${campaignId}/party-presence`, { headers })
          .then((res) => (res.ok ? res.json() : null))
          .then(
            (
              data: {
                members: Array<{
                  userId: string
                  role: string
                  playerName: string
                  avatarUrl: string | null
                  characterName: string | null
                }>
              } | null
            ) => {
              if (cancelled || !data) return
              setPlayerProfiles(
                data.members
                  .filter((m) => m.role === 'PLAYER')
                  .map((m) => ({
                    userId: m.userId as UUID,
                    label: m.characterName || m.playerName,
                    avatarUrl: m.avatarUrl,
                  }))
              )
            }
          )
          .catch(() => { /* non-critical */ })
      : Promise.resolve()

    Promise.all([fetchInventory, fetchProfiles]).catch(() => {
      if (!cancelled) {
        setError('Failed to load inventory.')
        setInventoryLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [campaignId, apiUrl, authToken, hydrateInventory, setInventoryLoading, isReadOnly])

  // ─── Character picker members ─────────────────────────────────────────────
  const pickerMembers = useMemo<CharacterPickerMember[]>(
    () =>
      playerProfiles.map((p) => ({
        ...p,
        isOnline: p.userId in sessionPresenceByUser,
      })),
    [playerProfiles, sessionPresenceByUser]
  )

  const visibleMembers = useMemo<CharacterPickerMember[]>(
    () => (isDM && showOfflinePlayers ? pickerMembers : pickerMembers.filter((m) => m.isOnline)),
    [isDM, showOfflinePlayers, pickerMembers]
  )

  const toggleOfflinePlayers = () => {
    setShowOfflinePlayers((prev) => {
      const next = !prev
      if (!next && view !== 'party') {
        const member = pickerMembers.find((m) => m.userId === view)
        if (member && !member.isOnline) {
          setView('party')
          setShowAddForm(false)
          setShowHistory(false)
        }
      }
      return next
    })
  }

  // ─── Derived data ─────────────────────────────────────────────────────────
  const currentOwnerId = view === 'party' ? null : (view as UUID)
  const currentOwnerType = view === 'party' ? ('party' as const) : ('character' as const)

  const viewedMember = useMemo(
    () => (view !== 'party' ? (pickerMembers.find((m) => m.userId === view) ?? null) : null),
    [view, pickerMembers]
  )
  const canRemove = !(isDM && viewedMember !== null && !viewedMember.isOnline)

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

  // Derived container grouping — stable references via useMemo
  const containers = useMemo(() => currentItems.filter((i) => i.isContainer), [currentItems])
  const topLevelItems = useMemo(
    () => currentItems.filter((i) => !i.isContainer && !i.containerId),
    [currentItems]
  )
  const itemsByContainerId = useMemo(() => {
    const map = new Map<UUID, InventoryItem[]>()
    for (const item of currentItems) {
      if (item.containerId) {
        const existing = map.get(item.containerId) ?? []
        existing.push(item)
        map.set(item.containerId, existing)
      }
    }
    return map
  }, [currentItems])

  const currentWallet = useMemo(
    () =>
      allWallets.find(
        (w) =>
          w.ownerType === currentOwnerType &&
          (currentOwnerType === 'party' ? w.ownerId === null : w.ownerId === currentOwnerId)
      ) ?? null,
    [allWallets, currentOwnerType, currentOwnerId]
  )

  const moveTargets = useMemo(
    () => [
      { label: 'Party', ownerType: 'party' as const, ownerId: null, avatarUrl: null, isOnline: true },
      ...visibleMembers
        .map((m) => ({
          label: m.label,
          ownerType: 'character' as const,
          ownerId: m.userId,
          avatarUrl: m.avatarUrl,
          isOnline: m.isOnline,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [visibleMembers]
  )

  const moveActionLabel = isPlayer ? (view === 'party' ? 'Take' : 'Give') : 'Move'
  const playerTakeTargets = useMemo(
    () => moveTargets.filter((t) => t.ownerType === 'character' && t.ownerId === currentUserId),
    [moveTargets, currentUserId]
  )

  const onlineMembers = useMemo(() => pickerMembers.filter((m) => m.isOnline), [pickerMembers])

  const currencyTransferTargets = useMemo<CurrencyTransferTarget[]>(() => {
    if (isReadOnly) return []
    if (isDM) {
      if (view !== 'party') return []
      return onlineMembers.map((m) => ({
        label: m.label,
        ownerType: 'character' as const,
        ownerId: m.userId,
        avatarUrl: m.avatarUrl,
        isOnline: true,
      }))
    }
    if (view === 'party') {
      return [
        {
          label: 'My Wallet',
          ownerType: 'character' as const,
          ownerId: currentUserId,
          avatarUrl: playerProfiles.find((p) => p.userId === currentUserId)?.avatarUrl ?? null,
          isOnline: true,
        },
      ]
    }
    return [
      { label: 'Party', ownerType: 'party' as const, ownerId: null, avatarUrl: null, isOnline: true },
      ...onlineMembers
        .filter((m) => m.userId !== currentUserId)
        .map((m) => ({
          label: m.label,
          ownerType: 'character' as const,
          ownerId: m.userId,
          avatarUrl: m.avatarUrl,
          isOnline: true,
        })),
    ]
  }, [isReadOnly, isDM, view, onlineMembers, currentUserId, playerProfiles])

  const currencyTransferLabel = isPlayer ? (view === 'party' ? 'Take' : 'Give') : 'Give'

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

  const setContainer = useCallback(
    async (itemId: UUID, containerId: UUID | null) => {
      await fetch(`${apiUrl}/api/inventory/${campaignId}/items/${itemId}/container`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerId }),
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

  const transferCurrency = useCallback(
    async (
      toOwnerType: 'party' | 'character',
      toOwnerId: UUID | null,
      amounts: Partial<Record<string, number>>
    ) => {
      const res = await fetch(`${apiUrl}/api/inventory/${campaignId}/transfer/currency`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromOwnerType: currentOwnerType,
          fromOwnerId: currentOwnerId,
          toOwnerType,
          toOwnerId,
          amounts,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        return data as { code: string; message?: string; shortfall?: Record<string, number> }
      }
    },
    [apiUrl, campaignId, authToken, currentOwnerType, currentOwnerId]
  )

  const handleAddItem = useCallback(
    async (
      name: string,
      quantity: number,
      notes: string,
      srdCategory: InventoryItemCategory,
      srdKey?: string
    ) => {
      await fetch(`${apiUrl}/api/inventory/${campaignId}/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerType: currentOwnerType,
          ownerId: currentOwnerId,
          name,
          quantity,
          source: srdKey ? InventoryItemSource.SRD : InventoryItemSource.CUSTOM,
          srdKey: srdKey || undefined,
          srdCategory,
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
    setShowHistory(false)
  }

  // Drag-and-drop handlers — passed down to rows and container sections
  const handleDragItemStart = useCallback((itemId: UUID) => setDraggingItemId(itemId), [])
  const handleDragItemEnd = useCallback(() => {
    setDraggingItemId(null)
    setTopLevelDragOver(false)
  }, [])

  // Shared row props helper to avoid repetition
  const rowProps = (item: InventoryItem) => {
    const baseMoveTargets =
      isPlayer && view === 'party' ? playerTakeTargets : moveTargets
    return {
      isReadOnly,
      canRemove,
      moveActionLabel,
      onRemove: removeItem,
      onEdit: editItem,
      onMove: moveItem,
      onSetContainer: setContainer,
      moveTargets: baseMoveTargets.filter(
        (t) => !(t.ownerType === item.ownerType && t.ownerId === item.ownerId)
      ),
      availableContainers: containers,
      isDragging: draggingItemId === item.id,
      onDragItemStart: handleDragItemStart,
      onDragItemEnd: handleDragItemEnd,
    }
  }

  const totalItemCount = currentItems.length

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <section className="inventory-panel" aria-label="Inventory">
      <header className="inventory-panel__header">
        <h4 className="inventory-panel__title">
          <Icon name="inventory" />
          Inventory
        </h4>
        <div className="inventory-panel__header-actions">
          {isDM && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`inventory-panel__history-btn${showOfflinePlayers ? ' inventory-panel__history-btn--active' : ''}`}
                  aria-label={showOfflinePlayers ? 'Hide offline players' : 'Show offline players'}
                  onClick={toggleOfflinePlayers}
                >
                  <Icon name={showOfflinePlayers ? 'visibility' : 'visibility_off'} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {showOfflinePlayers ? 'Hide offline players' : 'Show offline players'}
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={`inventory-panel__history-btn${showHistory ? ' inventory-panel__history-btn--active' : ''}`}
                aria-label={showHistory ? 'Hide history' : 'Show history'}
                onClick={() => setShowHistory((v) => !v)}
              >
                <Icon name="receipt_long" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {showHistory ? 'Hide history' : 'Show history'}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {isPlayer && (
        <div className="inventory-panel__view-tabs" role="tablist" aria-label="Inventory view">
          <button
            type="button"
            role="tab"
            aria-selected={view === currentUserId}
            className="inventory-panel__view-tab"
            data-active={view === currentUserId}
            onClick={() => switchView(currentUserId)}
          >
            My Inventory
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'party'}
            className="inventory-panel__view-tab"
            data-active={view === 'party'}
            onClick={() => switchView('party')}
          >
            Party Inventory
          </button>
        </div>
      )}

      {isDM && (
        <InventoryCharacterPicker
          members={visibleMembers}
          selectedUserId={view === 'party' ? null : (view as UUID)}
          onSelect={(userId) => switchView(userId ?? 'party')}
        />
      )}

      {showHistory ? (
        <InventoryHistoryOverlay
          campaignId={campaignId}
          apiUrl={apiUrl}
          authToken={authToken}
          onClose={() => setShowHistory(false)}
          ownerOptions={[
            { label: 'Party', ownerType: 'party', ownerId: null },
            ...playerProfiles.map((p) => ({
              label: p.label,
              ownerType: 'character' as const,
              ownerId: p.userId,
            })),
          ]}
        />
      ) : isLoading ? (
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
          {isDM && viewedMember && (
            <p className="inventory-panel__char-label">
              {viewedMember.label}'s Inventory
              {!viewedMember.isOnline && (
                <span className="inventory-panel__char-label-offline"> · offline</span>
              )}
            </p>
          )}

          <InventoryCurrencyRow
            wallet={currentWallet}
            isReadOnly={isReadOnly}
            onAdjust={adjustCurrency}
            transferTargets={currencyTransferTargets}
            transferActionLabel={currencyTransferLabel}
            allWallets={allWallets}
            onTransfer={transferCurrency}
          />

          <div className="inventory-panel__items-header">
            <span className="inventory-panel__items-label">
              Items {totalItemCount > 0 ? `(${totalItemCount})` : ''}
            </span>
            {!isReadOnly && (
              <button
                type="button"
                className="inventory-panel__add-btn"
                aria-label="Add item"
                onClick={() => setShowAddForm((v) => !v)}
              >
                <Icon name="storefront" />
                Add
              </button>
            )}
          </div>

          {showAddForm && (
            <InventoryAddItemForm
              onAdd={handleAddItem}
              onCancel={() => setShowAddForm(false)}
              apiUrl={apiUrl}
              authToken={authToken}
              ruleset={dndRuleset}
            />
          )}

          {totalItemCount === 0 && !showAddForm ? (
            <p className="inventory-panel__empty">No items yet.</p>
          ) : (
            <ul className="inventory-panel__item-list" aria-label="Inventory items">
              {/* Container sections first */}
              {containers.map((container) => (
                <ContainerSection
                  key={container.id}
                  container={container}
                  contents={itemsByContainerId.get(container.id) ?? EMPTY_ITEMS}
                  isReadOnly={isReadOnly}
                  canRemove={canRemove}
                  moveActionLabel={moveActionLabel}
                  moveTargets={(isPlayer && view === 'party' ? playerTakeTargets : moveTargets).filter(
                    (t) => !(t.ownerType === container.ownerType && t.ownerId === container.ownerId)
                  )}
                  onRemove={removeItem}
                  onEdit={editItem}
                  onMove={moveItem}
                  onSetContainer={setContainer}
                  otherContainers={containers.filter((c) => c.id !== container.id)}
                  draggingItemId={draggingItemId}
                  onDragItemStart={handleDragItemStart}
                  onDragItemEnd={handleDragItemEnd}
                />
              ))}

              {/* Top-level items — also a drop target to remove items from containers */}
              {(topLevelItems.length > 0 || (draggingItemId != null)) && (
                <li
                  className={[
                    'inventory-panel__top-level-zone',
                    topLevelDragOver && draggingItemId != null ? 'inventory-panel__top-level-zone--drag-over' : '',
                  ].filter(Boolean).join(' ')}
                  onDragOver={(e) => {
                    if (draggingItemId == null) return
                    // Only show drop hint if item is currently inside a container
                    const isDraggingInsideContainer = topLevelItems.every((i) => i.id !== draggingItemId)
                    if (!isDraggingInsideContainer) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setTopLevelDragOver(true)
                  }}
                  onDragLeave={() => setTopLevelDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    const droppedId = e.dataTransfer.getData('text/plain') as UUID
                    if (droppedId) setContainer(droppedId, null)
                    setTopLevelDragOver(false)
                  }}
                >
                  {topLevelItems.map((item) => (
                    <InventoryItemRow
                      key={item.id}
                      item={item}
                      {...rowProps(item)}
                    />
                  ))}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
