/**
 * Inventory Events
 * Reference: docs/subsystems/INVENTORY-SYSTEM.md
 *
 * Inventory events are campaign-scoped and persist across session boundaries.
 * All mutations during an ACTIVE session also produce a CHAT:MESSAGE_SENT system message.
 */

import type { UUID, InventoryItemSource, InventoryItemCategory, CurrencyWallet } from '../types'
import type { ItemMetadata } from '../utils/inventory-normalize'
import type { EventEnvelope } from './base'

export type InventoryEventType =
  | 'INVENTORY:ITEM_ADDED'
  | 'INVENTORY:ITEM_REMOVED'
  | 'INVENTORY:ITEM_TRANSFERRED'
  | 'INVENTORY:ITEM_EDITED'
  | 'INVENTORY:ITEM_UPDATED'
  | 'INVENTORY:CONTAINER_TRANSFERRED'
  | 'INVENTORY:LOOT_SPLIT_PROPOSED'
  | 'INVENTORY:LOOT_SPLIT_ACCEPTED'
  | 'INVENTORY:LOOT_SPLIT_EXPIRED'
  | 'INVENTORY:CURRENCY_CHANGED'
  | 'INVENTORY:EXTENSION_SYNC_PENDING'

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
  // Container support
  isContainer: boolean
  containerId: UUID | null
  // Extended item data
  metadata?: ItemMetadata | null
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
 * INVENTORY:ITEM_UPDATED
 * An item was mutated in-place without changing ownership: notes edit, quantity change,
 * containerId change (drag-and-drop within same owner), or extended field update.
 * Carries the full updated item so clients can replace it atomically.
 */
export interface InventoryItemUpdated {
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
  updatedByUserId: UUID
  updatedAt: number
}

export type InventoryItemUpdatedEvent = EventEnvelope<InventoryItemUpdated>

/**
 * INVENTORY:CONTAINER_TRANSFERRED
 * A container item AND all of its contents were atomically moved between owners.
 * Clients must replace the container and all matching containerId items in one update
 * to avoid a flash of orphaned items.
 */
export interface InventoryContainerTransferred {
  campaignId: UUID
  containerId: UUID
  containerName: string
  fromOwnerType: 'party' | 'character'
  fromOwnerId: UUID | null
  toOwnerType: 'party' | 'character'
  toOwnerId: UUID | null
  /** Full updated container item. */
  container: InventoryItemUpdated
  /** Full updated contained items (containerId = containerId, ownership changed). */
  items: InventoryItemUpdated[]
  transferredByUserId: UUID
  transferredAt: number
}

export type InventoryContainerTransferredEvent = EventEnvelope<InventoryContainerTransferred>

/**
 * INVENTORY:EXTENSION_SYNC_PENDING
 * Extension sync produced a conflict under the campaign's `PROMPT` conflict resolution policy.
 * Sent only to the campaign DM (not broadcast to all clients) — see INVENTORY-SYSTEM.md §12.3/§12.4.
 */
export interface InventoryExtensionSyncPending {
  campaignId: UUID
  characterId: UUID
  pendingSyncId: UUID
  kind: 'ITEM' | 'CURRENCY'
  externalId: string
}

export type InventoryExtensionSyncPendingEvent = EventEnvelope<InventoryExtensionSyncPending>

/**
 * Union of all inventory events.
 */
export type InventoryEvent =
  | InventoryItemAddedEvent
  | InventoryItemRemovedEvent
  | InventoryItemTransferredEvent
  | InventoryItemEditedEvent
  | InventoryItemUpdatedEvent
  | InventoryContainerTransferredEvent
  | InventoryLootSplitProposedEvent
  | InventoryLootSplitAcceptedEvent
  | InventoryLootSplitExpiredEvent
  | InventoryCurrencyChangedEvent
  | InventoryExtensionSyncPendingEvent
