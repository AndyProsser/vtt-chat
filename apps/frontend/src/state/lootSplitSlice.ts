/**
 * Loot Split Slice (Zustand)
 * Tracks active loot split proposals for the current session.
 * Keyed by splitId. Used by LootSplitCard to show live acceptance state.
 */

import type { StateCreator } from 'zustand'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'

export interface LootSplitShare {
  userId: UUID
  quantity: number
  accepted: boolean
}

export interface ActiveLootSplit {
  splitId: UUID
  campaignId: UUID
  itemName: string
  totalQuantity: number
  shareQuantity: number
  shares: LootSplitShare[]
  proposedByUserId: UUID
  expiresAt: number
  proposedAt: number
  expired: boolean
}

export interface LootSplitSlice {
  /** Active splits keyed by splitId */
  activeLootSplits: Record<UUID, ActiveLootSplit>

  handleLootSplitProposed: (event: EventEnvelope) => void
  handleLootSplitAccepted: (event: EventEnvelope) => void
  handleLootSplitExpired: (event: EventEnvelope) => void
  clearLootSplits: () => void
}

export const createLootSplitSlice: StateCreator<LootSplitSlice> = (set) => ({
  activeLootSplits: {},

  handleLootSplitProposed: (event) => {
    const p = event.payload as {
      campaignId: UUID
      splitId: UUID
      itemId: UUID
      itemName: string
      totalQuantity: number
      shares: Array<{ userId: UUID; quantity: number }>
      proposedByUserId: UUID
      expiresAt: number
      proposedAt: number
    }

    const split: ActiveLootSplit = {
      splitId: p.splitId,
      campaignId: p.campaignId,
      itemName: p.itemName,
      totalQuantity: p.totalQuantity,
      shareQuantity: p.shares[0]?.quantity ?? 1,
      shares: p.shares.map((s) => ({ ...s, accepted: false })),
      proposedByUserId: p.proposedByUserId,
      expiresAt: p.expiresAt,
      proposedAt: p.proposedAt,
      expired: false,
    }

    set((state) => ({
      activeLootSplits: { ...state.activeLootSplits, [p.splitId]: split },
    }))
  },

  handleLootSplitAccepted: (event) => {
    const p = event.payload as { splitId: UUID; userId: UUID }
    set((state) => {
      const split = state.activeLootSplits[p.splitId]
      if (!split) return state
      return {
        activeLootSplits: {
          ...state.activeLootSplits,
          [p.splitId]: {
            ...split,
            shares: split.shares.map((s) =>
              s.userId === p.userId ? { ...s, accepted: true } : s
            ),
          },
        },
      }
    })
  },

  handleLootSplitExpired: (event) => {
    const p = event.payload as { splitId: UUID }
    set((state) => {
      const split = state.activeLootSplits[p.splitId]
      if (!split) return state
      return {
        activeLootSplits: {
          ...state.activeLootSplits,
          [p.splitId]: { ...split, expired: true },
        },
      }
    })
  },

  clearLootSplits: () => set({ activeLootSplits: {} }),
})
