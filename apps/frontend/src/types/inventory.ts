import type { UUID, InventoryItemSource, InventoryItemCategory } from '@shared'
import type { ItemMetadata } from '@shared'

export type { ItemMetadata }

export interface InventoryItem {
  id: UUID
  campaignId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
  quantity: number
  source: InventoryItemSource
  srdKey: string | null
  srdCategory: InventoryItemCategory
  notes: string | null
  externalId: string | null
  externalSource: string | null
  addedByUserId: UUID
  createdAt: number
  updatedAt: number
  // Container support (§2.1b)
  isContainer: boolean
  containerId: UUID | null
  // Extended item data (§2.1c)
  metadata: ItemMetadata | null
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
  actorName: string
  actionType: string
  fromOwnerType: string | null
  fromOwnerId: UUID | null
  fromOwnerName: string | null
  toOwnerType: string | null
  toOwnerId: UUID | null
  toOwnerName: string | null
  quantity: number | null
  currencyDelta: Partial<{ cp: number; sp: number; ep: number; gp: number; pp: number }> | null
  itemName: string | null
  notes: string | null
  createdAt: number
}
