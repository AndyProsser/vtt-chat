/**
 * Inventory Slice (Zustand)
 * Campaign-scoped inventory state: items and currency wallets.
 * Rehydrated from REST on panel mount; kept in sync via INVENTORY:* WS events.
 * No Redis backing — inventory is not presence or audio data.
 */

import type { StateCreator } from 'zustand'
import { InventoryItemSource, InventoryItemCategory } from '@shared'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import type { InventoryItem, CurrencyWalletState, ItemMetadata } from '@/types/inventory'

export type { InventoryItem, CurrencyWalletState } from '@/types/inventory'

export interface InventorySlice {
  // State — keyed by campaignId
  inventoryItems: Record<UUID, Record<UUID, InventoryItem>>
  currencyWallets: Record<UUID, Record<UUID, CurrencyWalletState>>
  inventoryLoading: boolean

  // Actions
  setInventoryLoading: (loading: boolean) => void
  hydrateInventory: (
    campaignId: UUID,
    items: InventoryItem[],
    wallets: CurrencyWalletState[]
  ) => void
  clearInventory: (campaignId?: UUID) => void

  // WS event handlers
  handleInventoryItemAdded: (event: EventEnvelope) => void
  handleInventoryItemRemoved: (event: EventEnvelope) => void
  handleInventoryItemTransferred: (event: EventEnvelope) => void
  handleInventoryItemUpdated: (event: EventEnvelope) => void
  handleInventoryContainerTransferred: (event: EventEnvelope) => void
  handleInventoryCurrencyChanged: (event: EventEnvelope) => void
}

// Stable empty constants — avoid inline `|| {}` which causes Zustand snapshot loops
const EMPTY_ITEMS: Record<UUID, InventoryItem> = {}
const EMPTY_WALLETS: Record<UUID, CurrencyWalletState> = {}

export const createInventorySlice: StateCreator<InventorySlice> = (set) => ({
  inventoryItems: {},
  currencyWallets: {},
  inventoryLoading: false,

  setInventoryLoading: (loading) => set({ inventoryLoading: loading }),

  hydrateInventory: (campaignId, items, wallets) =>
    set((state) => {
      const itemsById: Record<UUID, InventoryItem> = {}
      for (const item of items) {
        itemsById[item.id] = item
      }

      const walletsById: Record<UUID, CurrencyWalletState> = {}
      for (const wallet of wallets) {
        walletsById[wallet.id] = wallet
      }

      return {
        inventoryItems: { ...state.inventoryItems, [campaignId]: itemsById },
        currencyWallets: { ...state.currencyWallets, [campaignId]: walletsById },
        inventoryLoading: false,
      }
    }),

  clearInventory: (campaignId) =>
    set((state) => {
      if (!campaignId) {
        return { inventoryItems: {}, currencyWallets: {} }
      }
      const nextItems = { ...state.inventoryItems }
      const nextWallets = { ...state.currencyWallets }
      delete nextItems[campaignId]
      delete nextWallets[campaignId]
      return { inventoryItems: nextItems, currencyWallets: nextWallets }
    }),

  // ─── WS event handlers ────────────────────────────────────────────────────

  handleInventoryItemAdded: (event) => {
    const payload = event.payload as {
      campaignId: UUID
      itemId: UUID
      ownerType: 'party' | 'character'
      ownerId: UUID | null
      name: string
      quantity: number
      source: string
      srdKey?: string
      srdCategory?: string
      notes?: string
      externalId?: string | null
      externalSource?: string | null
      addedByUserId: UUID
      addedAt: number
      isContainer?: boolean
      containerId?: UUID | null
      metadata?: ItemMetadata | null
    }

    const validSources: string[] = Object.values(InventoryItemSource)
    const validCategories: string[] = Object.values(InventoryItemCategory)
    const item: InventoryItem = {
      id: payload.itemId,
      campaignId: payload.campaignId,
      ownerType: payload.ownerType,
      ownerId: payload.ownerId,
      name: payload.name,
      quantity: payload.quantity,
      source: validSources.includes(payload.source)
        ? (payload.source as InventoryItemSource)
        : InventoryItemSource.CUSTOM,
      srdKey: payload.srdKey ?? null,
      srdCategory: validCategories.includes(payload.srdCategory ?? '')
        ? (payload.srdCategory as InventoryItemCategory)
        : InventoryItemCategory.EQUIPMENT,
      notes: payload.notes ?? null,
      externalId: payload.externalId ?? null,
      externalSource: payload.externalSource ?? null,
      addedByUserId: payload.addedByUserId,
      createdAt: payload.addedAt,
      updatedAt: payload.addedAt,
      isContainer: payload.isContainer ?? false,
      containerId: payload.containerId ?? null,
      metadata: payload.metadata ?? null,
    }

    set((state) => {
      const bucket = state.inventoryItems[payload.campaignId] ?? EMPTY_ITEMS
      return {
        inventoryItems: {
          ...state.inventoryItems,
          [payload.campaignId]: { ...bucket, [item.id]: item },
        },
      }
    })
  },

  handleInventoryItemRemoved: (event) => {
    const payload = event.payload as { campaignId: UUID; itemId: UUID }
    set((state) => {
      const bucket = state.inventoryItems[payload.campaignId]
      if (!bucket) return state

      const removedItem = bucket[payload.itemId]
      if (!removedItem) return state

      const next = { ...bucket }
      delete next[payload.itemId]

      // If the removed item was a container, cascade-remove all contained items
      if (removedItem.isContainer) {
        for (const [id, item] of Object.entries(next)) {
          if (item.containerId === payload.itemId) {
            delete next[id as UUID]
          }
        }
      }

      return {
        inventoryItems: { ...state.inventoryItems, [payload.campaignId]: next },
      }
    })
  },

  handleInventoryItemTransferred: (event) => {
    const payload = event.payload as {
      campaignId: UUID
      itemId: UUID
      toOwnerType: 'party' | 'character'
      toOwnerId: UUID | null
      transferredAt: number
    }
    set((state) => {
      const bucket = state.inventoryItems[payload.campaignId]
      const item = bucket?.[payload.itemId]
      if (!item) return state
      return {
        inventoryItems: {
          ...state.inventoryItems,
          [payload.campaignId]: {
            ...bucket,
            [payload.itemId]: {
              ...item,
              ownerType: payload.toOwnerType,
              ownerId: payload.toOwnerId,
              // Single-item transfer always clears containerId (top-level on destination)
              containerId: null,
              updatedAt: payload.transferredAt,
            },
          },
        },
      }
    })
  },

  /**
   * Handles INVENTORY:ITEM_UPDATED — covers notes/quantity edits, containerId
   * changes (container drag-and-drop within same owner), and extended field updates.
   */
  handleInventoryItemUpdated: (event) => {
    const payload = event.payload as {
      campaignId: UUID
      itemId: UUID
      ownerType: 'party' | 'character'
      ownerId: UUID | null
      name: string
      quantity: number
      notes: string | null
      isContainer: boolean
      containerId: UUID | null
      metadata: ItemMetadata | null
      updatedAt: number
    }
    set((state) => {
      const bucket = state.inventoryItems[payload.campaignId]
      const item = bucket?.[payload.itemId]
      if (!item) return state
      return {
        inventoryItems: {
          ...state.inventoryItems,
          [payload.campaignId]: {
            ...bucket,
            [payload.itemId]: {
              ...item,
              name: payload.name,
              quantity: payload.quantity,
              notes: payload.notes,
              isContainer: payload.isContainer,
              containerId: payload.containerId,
              metadata: payload.metadata,
              updatedAt: payload.updatedAt,
            },
          },
        },
      }
    })
  },

  /**
   * Handles INVENTORY:CONTAINER_TRANSFERRED — atomically replaces the container
   * and all of its contained items in one state update to avoid orphaned items.
   */
  handleInventoryContainerTransferred: (event) => {
    const payload = event.payload as {
      campaignId: UUID
      container: {
        itemId: UUID
        ownerType: 'party' | 'character'
        ownerId: UUID | null
        name: string
        quantity: number
        notes: string | null
        isContainer: boolean
        containerId: UUID | null
        metadata: ItemMetadata | null
        updatedAt: number
      }
      items: Array<{
        itemId: UUID
        ownerType: 'party' | 'character'
        ownerId: UUID | null
        name: string
        quantity: number
        notes: string | null
        isContainer: boolean
        containerId: UUID | null
        metadata: ItemMetadata | null
        updatedAt: number
      }>
    }
    set((state) => {
      const bucket = state.inventoryItems[payload.campaignId]
      if (!bucket) return state

      const next = { ...bucket }
      const applyUpdate = (u: typeof payload.container) => {
        const existing = next[u.itemId]
        if (existing) {
          next[u.itemId] = {
            ...existing,
            ownerType: u.ownerType,
            ownerId: u.ownerId,
            name: u.name,
            quantity: u.quantity,
            notes: u.notes,
            isContainer: u.isContainer,
            containerId: u.containerId,
            metadata: u.metadata,
            updatedAt: u.updatedAt,
          }
        }
      }

      applyUpdate(payload.container)
      for (const item of payload.items) {
        applyUpdate(item)
      }

      return {
        inventoryItems: { ...state.inventoryItems, [payload.campaignId]: next },
      }
    })
  },

  handleInventoryCurrencyChanged: (event) => {
    const payload = event.payload as {
      campaignId: UUID
      walletId: UUID
      ownerType: 'party' | 'character'
      ownerId: UUID | null
      newBalance: { cp: number; sp: number; ep: number; gp: number; pp: number }
      changedAt: number
    }
    set((state) => {
      const bucket = state.currencyWallets[payload.campaignId] ?? EMPTY_WALLETS
      const existing = bucket[payload.walletId]
      const updated: CurrencyWalletState = {
        id: payload.walletId,
        campaignId: payload.campaignId,
        ownerType: payload.ownerType,
        ownerId: payload.ownerId,
        ...payload.newBalance,
        updatedAt: payload.changedAt,
      }
      return {
        currencyWallets: {
          ...state.currencyWallets,
          [payload.campaignId]: {
            ...bucket,
            [payload.walletId]: existing ? { ...existing, ...updated } : updated,
          },
        },
      }
    })
  },
})
