import type { UUID, InventoryItemSource } from '@shared'

export interface InventoryItem {
  id: UUID
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
  quantity: number
  source: InventoryItemSource
  srdKey: string | null
  notes: string | null
  addedByUserId: UUID
  createdAt: number
  updatedAt: number
}

export interface CurrencyWalletState {
  id: UUID
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
  updatedAt: number
}

export interface InventoryHistoryEntry {
  id: UUID
  campaignId: UUID
  itemId: UUID | null
  sessionId: UUID | null
  actorUserId: UUID
  actionType: string
  fromOwnerType: string | null
  fromOwnerId: UUID | null
  toOwnerType: string | null
  toOwnerId: UUID | null
  quantity: number | null
  currencyDelta: Partial<{ cp: number; sp: number; ep: number; gp: number; pp: number }> | null
  itemName: string | null
  notes: string | null
  createdAt: number
}
