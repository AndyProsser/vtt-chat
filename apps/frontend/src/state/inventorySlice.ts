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
import type { InventoryItem, CurrencyWalletState } from '@/types/inventory'

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
  handleInventoryItemEdited: (event: EventEnvelope) => void
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
      addedByUserId: UUID
      addedAt: number
    }

    const validCategories: string[] = Object.values(InventoryItemCategory)
    const item: InventoryItem = {
      id: payload.itemId,
      campaignId: payload.campaignId,
      ownerType: payload.ownerType,
      ownerId: payload.ownerId,
      name: payload.name,
      quantity: payload.quantity,
      source: payload.source === 'SRD' ? InventoryItemSource.SRD : InventoryItemSource.CUSTOM,
      srdKey: payload.srdKey ?? null,
      srdCategory: validCategories.includes(payload.srdCategory ?? '')
        ? (payload.srdCategory as InventoryItemCategory)
        : InventoryItemCategory.EQUIPMENT,
      notes: payload.notes ?? null,
      addedByUserId: payload.addedByUserId,
      createdAt: payload.addedAt,
      updatedAt: payload.addedAt,
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
      if (!bucket?.[payload.itemId]) return state
      const next = { ...bucket }
      delete next[payload.itemId]
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
              updatedAt: payload.transferredAt,
            },
          },
        },
      }
    })
  },

  handleInventoryItemEdited: (event) => {
    const payload = event.payload as {
      campaignId: UUID
      itemId: UUID
      name: string
      quantity: number
      notes?: string | null
      editedAt: number
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
              notes: payload.notes ?? item.notes,
              updatedAt: payload.editedAt,
            },
          },
        },
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
