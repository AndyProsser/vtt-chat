import { beforeEach, describe, it, expect } from 'vitest'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import { InventoryItemSource, InventoryItemCategory } from '@shared'
import { useStore } from '@/state/store'

const CAMPAIGN_ID = 'aaaaaaaa-0000-0000-0000-000000000000' as UUID
const SESSION_ID = 'bbbbbbbb-0000-0000-0000-000000000000' as UUID
const ITEM_ID = 'cccccccc-0000-0000-0000-000000000000' as UUID
const ITEM_ID_2 = 'dddddddd-0000-0000-0000-000000000000' as UUID
const WALLET_ID = 'eeeeeeee-0000-0000-0000-000000000000' as UUID
const USER_ID = 'ffffffff-0000-0000-0000-000000000000' as UUID
const USER_ID_2 = '11111111-0000-0000-0000-000000000000' as UUID

const NOW = 1700000000000

function makeEnvelope(type: string, payload: object): EventEnvelope {
  return {
    id: 'ev-1' as UUID,
    type,
    version: 1,
    userId: USER_ID,
    userRole: 'DM' as any,
    sessionId: SESSION_ID,
    roomId: null,
    timestamp: NOW,
    payload,
  } as EventEnvelope
}

function seedItem() {
  useStore.setState({
    inventoryItems: {
      [CAMPAIGN_ID]: {
        [ITEM_ID]: {
          id: ITEM_ID,
          campaignId: CAMPAIGN_ID,
          ownerType: 'party',
          ownerId: null,
          name: 'Shortsword',
          quantity: 2,
          source: InventoryItemSource.SRD,
          srdKey: 'shortsword',
          srdCategory: InventoryItemCategory.EQUIPMENT,
          notes: null,
          externalId: null,
          externalSource: null,
          addedByUserId: USER_ID,
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    },
  })
}

// ─── handleInventoryItemAdded ─────────────────────────────────────────────────

describe('inventorySlice — handleInventoryItemAdded', () => {
  beforeEach(() => {
    useStore.setState({ inventoryItems: {}, currencyWallets: {} })
  })

  it('inserts a new item into the campaign bucket', () => {
    useStore.getState().handleInventoryItemAdded(
      makeEnvelope('INVENTORY:ITEM_ADDED', {
        campaignId: CAMPAIGN_ID,
        itemId: ITEM_ID,
        ownerType: 'party',
        ownerId: null,
        name: 'Shortsword',
        quantity: 3,
        source: InventoryItemSource.SRD,
        srdKey: 'shortsword',
        srdCategory: InventoryItemCategory.EQUIPMENT,
        notes: null,
        addedByUserId: USER_ID,
        addedAt: NOW,
      })
    )

    const item = useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]
    expect(item).toBeDefined()
    expect(item?.name).toBe('Shortsword')
    expect(item?.quantity).toBe(3)
    expect(item?.ownerType).toBe('party')
    expect(item?.ownerId).toBeNull()
  })

  it('defaults to CUSTOM source and EQUIPMENT category for unknown enum values', () => {
    useStore.getState().handleInventoryItemAdded(
      makeEnvelope('INVENTORY:ITEM_ADDED', {
        campaignId: CAMPAIGN_ID,
        itemId: ITEM_ID,
        ownerType: 'character',
        ownerId: USER_ID,
        name: 'Mystery Rune',
        quantity: 1,
        source: 'INVALID_SOURCE',
        srdCategory: 'INVALID_CAT',
        addedByUserId: USER_ID,
        addedAt: NOW,
      })
    )

    const item = useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]
    expect(item?.source).toBe(InventoryItemSource.CUSTOM)
    expect(item?.srdCategory).toBe(InventoryItemCategory.EQUIPMENT)
  })

  it('does not overwrite existing items with different ids', () => {
    seedItem()

    useStore.getState().handleInventoryItemAdded(
      makeEnvelope('INVENTORY:ITEM_ADDED', {
        campaignId: CAMPAIGN_ID,
        itemId: ITEM_ID_2,
        ownerType: 'party',
        ownerId: null,
        name: 'Torch',
        quantity: 5,
        source: InventoryItemSource.CUSTOM,
        addedByUserId: USER_ID,
        addedAt: NOW + 1,
      })
    )

    expect(useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]).toBeDefined()
    expect(useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID_2]?.name).toBe('Torch')
  })
})

// ─── handleInventoryItemRemoved ───────────────────────────────────────────────

describe('inventorySlice — handleInventoryItemRemoved', () => {
  beforeEach(() => {
    useStore.setState({ inventoryItems: {}, currencyWallets: {} })
    seedItem()
  })

  it('removes an existing item from the bucket', () => {
    useStore.getState().handleInventoryItemRemoved(
      makeEnvelope('INVENTORY:ITEM_REMOVED', { campaignId: CAMPAIGN_ID, itemId: ITEM_ID })
    )

    expect(useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]).toBeUndefined()
  })

  it('is a no-op for an unknown itemId', () => {
    const before = { ...useStore.getState().inventoryItems }
    useStore.getState().handleInventoryItemRemoved(
      makeEnvelope('INVENTORY:ITEM_REMOVED', {
        campaignId: CAMPAIGN_ID,
        itemId: '00000000-dead-0000-0000-000000000000' as UUID,
      })
    )

    expect(useStore.getState().inventoryItems).toEqual(before)
  })

  it('is a no-op for an unknown campaignId', () => {
    const before = { ...useStore.getState().inventoryItems }
    useStore.getState().handleInventoryItemRemoved(
      makeEnvelope('INVENTORY:ITEM_REMOVED', {
        campaignId: '00000000-dead-0000-0000-000000000000' as UUID,
        itemId: ITEM_ID,
      })
    )

    expect(useStore.getState().inventoryItems).toEqual(before)
  })
})

// ─── handleInventoryItemEdited ────────────────────────────────────────────────

describe('inventorySlice — handleInventoryItemEdited', () => {
  beforeEach(() => {
    useStore.setState({ inventoryItems: {}, currencyWallets: {} })
    seedItem()
  })

  it('updates name, quantity, notes, and updatedAt', () => {
    useStore.getState().handleInventoryItemEdited(
      makeEnvelope('INVENTORY:ITEM_EDITED', {
        campaignId: CAMPAIGN_ID,
        itemId: ITEM_ID,
        name: 'Shortsword +1',
        quantity: 5,
        notes: 'Found in the tomb',
        editedAt: NOW + 500,
      })
    )

    const item = useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]
    expect(item?.name).toBe('Shortsword +1')
    expect(item?.quantity).toBe(5)
    expect(item?.notes).toBe('Found in the tomb')
    expect(item?.updatedAt).toBe(NOW + 500)
  })

  it('preserves existing notes when payload notes is undefined', () => {
    useStore.setState({
      inventoryItems: {
        [CAMPAIGN_ID]: {
          [ITEM_ID]: {
            ...(useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]!),
            notes: 'Pre-existing note',
          },
        },
      },
    })

    useStore.getState().handleInventoryItemEdited(
      makeEnvelope('INVENTORY:ITEM_EDITED', {
        campaignId: CAMPAIGN_ID,
        itemId: ITEM_ID,
        name: 'Shortsword',
        quantity: 2,
        editedAt: NOW + 100,
      })
    )

    expect(useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]?.notes).toBe('Pre-existing note')
  })

  it('is a no-op for an unknown itemId', () => {
    const before = { ...useStore.getState().inventoryItems }
    useStore.getState().handleInventoryItemEdited(
      makeEnvelope('INVENTORY:ITEM_EDITED', {
        campaignId: CAMPAIGN_ID,
        itemId: '00000000-dead-0000-0000-000000000000' as UUID,
        name: 'Ghost Item',
        quantity: 1,
        editedAt: NOW,
      })
    )

    expect(useStore.getState().inventoryItems).toEqual(before)
  })
})

// ─── handleInventoryItemTransferred ──────────────────────────────────────────

describe('inventorySlice — handleInventoryItemTransferred', () => {
  beforeEach(() => {
    useStore.setState({ inventoryItems: {}, currencyWallets: {} })
    seedItem()
  })

  it('updates ownerType, ownerId, and updatedAt', () => {
    useStore.getState().handleInventoryItemTransferred(
      makeEnvelope('INVENTORY:ITEM_TRANSFERRED', {
        campaignId: CAMPAIGN_ID,
        itemId: ITEM_ID,
        toOwnerType: 'character',
        toOwnerId: USER_ID_2,
        transferredAt: NOW + 200,
      })
    )

    const item = useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]
    expect(item?.ownerType).toBe('character')
    expect(item?.ownerId).toBe(USER_ID_2)
    expect(item?.updatedAt).toBe(NOW + 200)
  })

  it('preserves other item fields after transfer', () => {
    useStore.getState().handleInventoryItemTransferred(
      makeEnvelope('INVENTORY:ITEM_TRANSFERRED', {
        campaignId: CAMPAIGN_ID,
        itemId: ITEM_ID,
        toOwnerType: 'character',
        toOwnerId: USER_ID_2,
        transferredAt: NOW + 200,
      })
    )

    const item = useStore.getState().inventoryItems[CAMPAIGN_ID]?.[ITEM_ID]
    expect(item?.name).toBe('Shortsword')
    expect(item?.quantity).toBe(2)
    expect(item?.source).toBe(InventoryItemSource.SRD)
  })

  it('is a no-op for an unknown itemId', () => {
    const before = { ...useStore.getState().inventoryItems }
    useStore.getState().handleInventoryItemTransferred(
      makeEnvelope('INVENTORY:ITEM_TRANSFERRED', {
        campaignId: CAMPAIGN_ID,
        itemId: '00000000-dead-0000-0000-000000000000' as UUID,
        toOwnerType: 'character',
        toOwnerId: USER_ID_2,
        transferredAt: NOW,
      })
    )

    expect(useStore.getState().inventoryItems).toEqual(before)
  })
})

// ─── handleInventoryCurrencyChanged ──────────────────────────────────────────

describe('inventorySlice — handleInventoryCurrencyChanged', () => {
  beforeEach(() => {
    useStore.setState({ inventoryItems: {}, currencyWallets: {} })
  })

  it('inserts a new wallet when none exists', () => {
    useStore.getState().handleInventoryCurrencyChanged(
      makeEnvelope('INVENTORY:CURRENCY_CHANGED', {
        campaignId: CAMPAIGN_ID,
        walletId: WALLET_ID,
        ownerType: 'party',
        ownerId: null,
        newBalance: { cp: 0, sp: 5, ep: 0, gp: 10, pp: 0 },
        changedAt: NOW,
      })
    )

    const wallet = useStore.getState().currencyWallets[CAMPAIGN_ID]?.[WALLET_ID]
    expect(wallet).toBeDefined()
    expect(wallet?.sp).toBe(5)
    expect(wallet?.gp).toBe(10)
    expect(wallet?.ownerType).toBe('party')
  })

  it('updates balance on an existing wallet', () => {
    // Seed an existing wallet
    useStore.setState({
      currencyWallets: {
        [CAMPAIGN_ID]: {
          [WALLET_ID]: {
            id: WALLET_ID,
            campaignId: CAMPAIGN_ID,
            ownerType: 'party',
            ownerId: null,
            cp: 100,
            sp: 50,
            ep: 0,
            gp: 25,
            pp: 1,
            updatedAt: NOW - 1000,
          },
        },
      },
    })

    useStore.getState().handleInventoryCurrencyChanged(
      makeEnvelope('INVENTORY:CURRENCY_CHANGED', {
        campaignId: CAMPAIGN_ID,
        walletId: WALLET_ID,
        ownerType: 'party',
        ownerId: null,
        newBalance: { cp: 50, sp: 50, ep: 0, gp: 30, pp: 1 },
        changedAt: NOW + 500,
      })
    )

    const wallet = useStore.getState().currencyWallets[CAMPAIGN_ID]?.[WALLET_ID]
    expect(wallet?.cp).toBe(50)
    expect(wallet?.gp).toBe(30)
    expect(wallet?.updatedAt).toBe(NOW + 500)
  })

  it('does not affect wallets in other campaigns', () => {
    const OTHER_CAMPAIGN = '22222222-0000-0000-0000-000000000000' as UUID
    const OTHER_WALLET = '33333333-0000-0000-0000-000000000000' as UUID

    useStore.setState({
      currencyWallets: {
        [OTHER_CAMPAIGN]: {
          [OTHER_WALLET]: {
            id: OTHER_WALLET,
            campaignId: OTHER_CAMPAIGN,
            ownerType: 'party',
            ownerId: null,
            cp: 0,
            sp: 0,
            ep: 0,
            gp: 999,
            pp: 0,
            updatedAt: NOW,
          },
        },
      },
    })

    useStore.getState().handleInventoryCurrencyChanged(
      makeEnvelope('INVENTORY:CURRENCY_CHANGED', {
        campaignId: CAMPAIGN_ID,
        walletId: WALLET_ID,
        ownerType: 'party',
        ownerId: null,
        newBalance: { cp: 0, sp: 0, ep: 0, gp: 1, pp: 0 },
        changedAt: NOW,
      })
    )

    expect(useStore.getState().currencyWallets[OTHER_CAMPAIGN]?.[OTHER_WALLET]?.gp).toBe(999)
  })
})
