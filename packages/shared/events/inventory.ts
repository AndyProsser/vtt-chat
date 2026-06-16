/**
 * Inventory Events
 * Reference: docs/subsystems/INVENTORY-SYSTEM.md
 *
 * Inventory events are campaign-scoped and persist across session boundaries.
 * All mutations during an ACTIVE session also produce a CHAT:MESSAGE_SENT system message.
 */

import type { UUID, InventoryItemSource, InventoryItemCategory, CurrencyWallet } from '../types'
import type { EventEnvelope } from './base'

export type InventoryEventType =
  | 'INVENTORY:ITEM_ADDED'
  | 'INVENTORY:ITEM_REMOVED'
  | 'INVENTORY:ITEM_TRANSFERRED'
  | 'INVENTORY:ITEM_EDITED'
  | 'INVENTORY:LOOT_SPLIT_PROPOSED'
  | 'INVENTORY:LOOT_SPLIT_ACCEPTED'
  | 'INVENTORY:LOOT_SPLIT_EXPIRED'
  | 'INVENTORY:CURRENCY_CHANGED'

/**
 * INVENTORY:ITEM_ADDED
 * DM or permitted player adds an item to a character or the party inventory.
 */
export interface InventoryItemAdded {
  campaignId: UUID
  itemId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
  quantity: number
  source: InventoryItemSource
  srdKey?: string
  srdCategory: InventoryItemCategory
  notes?: string
  externalId?: string
  externalSource?: string
  addedByUserId: UUID
  addedAt: number
}

export type InventoryItemAddedEvent = EventEnvelope<InventoryItemAdded>

/**
 * INVENTORY:ITEM_REMOVED
 * DM or permitted player removes an item.
 */
export interface InventoryItemRemoved {
  campaignId: UUID
  itemId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
  quantity: number
  removedByUserId: UUID
  removedAt: number
}

export type InventoryItemRemovedEvent = EventEnvelope<InventoryItemRemoved>

/**
 * INVENTORY:ITEM_TRANSFERRED
 * Item moves between party and a character, or between two characters.
 */
export interface InventoryItemTransferred {
  campaignId: UUID
  itemId: UUID
  name: string
  quantity: number
  fromOwnerType: 'party' | 'character'
  fromOwnerId: UUID | null
  toOwnerType: 'party' | 'character'
  toOwnerId: UUID | null
  transferredByUserId: UUID
  transferredAt: number
}

export type InventoryItemTransferredEvent = EventEnvelope<InventoryItemTransferred>

/**
 * INVENTORY:ITEM_EDITED
 * DM edits an item's name, quantity, or notes.
 */
export interface InventoryItemEdited {
  campaignId: UUID
  itemId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  name: string
  quantity: number
  notes?: string
  editedByUserId: UUID
  editedAt: number
}

export type InventoryItemEditedEvent = EventEnvelope<InventoryItemEdited>

/**
 * INVENTORY:LOOT_SPLIT_PROPOSED
 * DM proposes a loot split. A Loot Split Card appears in chat.
 * Expires after 60 seconds if not fully accepted.
 */
export interface InventoryLootSplitProposed {
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

export type InventoryLootSplitProposedEvent = EventEnvelope<InventoryLootSplitProposed>

/**
 * INVENTORY:LOOT_SPLIT_ACCEPTED
 * A player accepts their share of a loot split.
 */
export interface InventoryLootSplitAccepted {
  campaignId: UUID
  splitId: UUID
  userId: UUID
  quantity: number
  acceptedAt: number
}

export type InventoryLootSplitAcceptedEvent = EventEnvelope<InventoryLootSplitAccepted>

/**
 * INVENTORY:LOOT_SPLIT_EXPIRED
 * The loot split window expired. Unaccepted shares revert to party inventory.
 */
export interface InventoryLootSplitExpired {
  campaignId: UUID
  splitId: UUID
  revertedQuantity: number
  expiredAt: number
}

export type InventoryLootSplitExpiredEvent = EventEnvelope<InventoryLootSplitExpired>

/**
 * INVENTORY:CURRENCY_CHANGED
 * Currency wallet updated for a character or the party purse.
 * delta contains the signed change per denomination; newBalance is the result.
 */
export interface InventoryCurrencyChanged {
  campaignId: UUID
  walletId: UUID
  ownerType: 'party' | 'character'
  ownerId: UUID | null
  delta: Partial<CurrencyWallet>
  newBalance: CurrencyWallet
  changedByUserId: UUID
  changedAt: number
}

export type InventoryCurrencyChangedEvent = EventEnvelope<InventoryCurrencyChanged>

/**
 * Union of all inventory events.
 */
export type InventoryEvent =
  | InventoryItemAddedEvent
  | InventoryItemRemovedEvent
  | InventoryItemTransferredEvent
  | InventoryItemEditedEvent
  | InventoryLootSplitProposedEvent
  | InventoryLootSplitAcceptedEvent
  | InventoryLootSplitExpiredEvent
  | InventoryCurrencyChangedEvent
