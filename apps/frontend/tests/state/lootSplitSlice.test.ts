import { beforeEach, describe, it, expect } from 'vitest'
import type { UUID } from '@shared'
import type { EventEnvelope } from '@shared'
import { useStore } from '@/state/store'

const CAMPAIGN_ID = '00000001-0000-0000-0000-000000000000' as UUID
const SESSION_ID = '00000002-0000-0000-0000-000000000000' as UUID
const SPLIT_ID = '00000003-0000-0000-0000-000000000000' as UUID
const ITEM_ID = '00000004-0000-0000-0000-000000000000' as UUID
const DM_ID = '00000005-0000-0000-0000-000000000000' as UUID
const PLAYER_A = '00000006-0000-0000-0000-000000000000' as UUID
const PLAYER_B = '00000007-0000-0000-0000-000000000000' as UUID

const NOW = Date.now()
const EXPIRES_AT = NOW + 60_000

function makeProposedEvent(overrides: Partial<object> = {}): EventEnvelope {
  return {
    id: SPLIT_ID,
    type: 'INVENTORY:LOOT_SPLIT_PROPOSED',
    version: 1,
    userId: DM_ID,
    userRole: 'DM' as any,
    sessionId: SESSION_ID,
    roomId: null,
    timestamp: NOW,
    payload: {
      campaignId: CAMPAIGN_ID,
      splitId: SPLIT_ID,
      itemId: ITEM_ID,
      itemName: 'Potion of Healing',
      totalQuantity: 4,
      shares: [
        { userId: PLAYER_A, quantity: 2 },
        { userId: PLAYER_B, quantity: 2 },
      ],
      proposedByUserId: DM_ID,
      expiresAt: EXPIRES_AT,
      proposedAt: NOW,
      ...overrides,
    },
  } as EventEnvelope
}

describe('lootSplitSlice — handleLootSplitProposed', () => {
  beforeEach(() => {
    useStore.setState({ activeLootSplits: {} })
  })

  it('stores the split with accepted: false for each share', () => {
    useStore.getState().handleLootSplitProposed(makeProposedEvent())
    const split = useStore.getState().activeLootSplits[SPLIT_ID]

    expect(split).toBeDefined()
    expect(split.itemName).toBe('Potion of Healing')
    expect(split.totalQuantity).toBe(4)
    expect(split.expired).toBe(false)
    expect(split.shares).toHaveLength(2)
    expect(split.shares[0]).toMatchObject({ userId: PLAYER_A, quantity: 2, accepted: false })
    expect(split.shares[1]).toMatchObject({ userId: PLAYER_B, quantity: 2, accepted: false })
  })

  it('sets shareQuantity from the first share', () => {
    useStore.getState().handleLootSplitProposed(makeProposedEvent())
    const split = useStore.getState().activeLootSplits[SPLIT_ID]
    expect(split.shareQuantity).toBe(2)
  })
})

describe('lootSplitSlice — handleLootSplitAccepted', () => {
  beforeEach(() => {
    useStore.setState({ activeLootSplits: {} })
    useStore.getState().handleLootSplitProposed(makeProposedEvent())
  })

  it('marks the accepting user\'s share as accepted', () => {
    const event: EventEnvelope = {
      id: 'ev1' as UUID,
      type: 'INVENTORY:LOOT_SPLIT_ACCEPTED',
      version: 1,
      userId: PLAYER_A,
      userRole: 'PLAYER' as any,
      sessionId: SESSION_ID,
      roomId: null,
      timestamp: NOW + 1000,
      payload: { splitId: SPLIT_ID, userId: PLAYER_A },
    }

    useStore.getState().handleLootSplitAccepted(event)

    const split = useStore.getState().activeLootSplits[SPLIT_ID]
    const shareA = split.shares.find((s) => s.userId === PLAYER_A)
    const shareB = split.shares.find((s) => s.userId === PLAYER_B)
    expect(shareA?.accepted).toBe(true)
    expect(shareB?.accepted).toBe(false)
  })

  it('is a no-op for an unknown splitId', () => {
    const before = { ...useStore.getState().activeLootSplits }
    const event: EventEnvelope = {
      id: 'ev2' as UUID,
      type: 'INVENTORY:LOOT_SPLIT_ACCEPTED',
      version: 1,
      userId: PLAYER_A,
      userRole: 'PLAYER' as any,
      sessionId: SESSION_ID,
      roomId: null,
      timestamp: NOW,
      payload: { splitId: 'unknown-split-id' as UUID, userId: PLAYER_A },
    }

    useStore.getState().handleLootSplitAccepted(event)

    expect(useStore.getState().activeLootSplits).toEqual(before)
  })
})

describe('lootSplitSlice — handleLootSplitExpired', () => {
  beforeEach(() => {
    useStore.setState({ activeLootSplits: {} })
    useStore.getState().handleLootSplitProposed(makeProposedEvent())
  })

  it('sets expired: true on the split', () => {
    const event: EventEnvelope = {
      id: 'ev3' as UUID,
      type: 'INVENTORY:LOOT_SPLIT_EXPIRED',
      version: 1,
      userId: DM_ID,
      userRole: 'DM' as any,
      sessionId: SESSION_ID,
      roomId: null,
      timestamp: EXPIRES_AT,
      payload: { splitId: SPLIT_ID },
    }

    useStore.getState().handleLootSplitExpired(event)

    expect(useStore.getState().activeLootSplits[SPLIT_ID].expired).toBe(true)
  })

  it('does not affect other splits', () => {
    const OTHER_SPLIT = '99999999-0000-0000-0000-000000000000' as UUID
    const otherProposed = { ...makeProposedEvent() }
    ;(otherProposed as any).id = OTHER_SPLIT
    ;(otherProposed.payload as any).splitId = OTHER_SPLIT
    useStore.getState().handleLootSplitProposed(otherProposed)

    const expireEvent: EventEnvelope = {
      id: 'ev4' as UUID,
      type: 'INVENTORY:LOOT_SPLIT_EXPIRED',
      version: 1,
      userId: DM_ID,
      userRole: 'DM' as any,
      sessionId: SESSION_ID,
      roomId: null,
      timestamp: EXPIRES_AT,
      payload: { splitId: SPLIT_ID },
    }

    useStore.getState().handleLootSplitExpired(expireEvent)

    expect(useStore.getState().activeLootSplits[SPLIT_ID].expired).toBe(true)
    expect(useStore.getState().activeLootSplits[OTHER_SPLIT].expired).toBe(false)
  })
})

describe('lootSplitSlice — clearLootSplits', () => {
  beforeEach(() => {
    useStore.setState({ activeLootSplits: {} })
  })

  it('empties activeLootSplits', () => {
    useStore.getState().handleLootSplitProposed(makeProposedEvent())
    expect(Object.keys(useStore.getState().activeLootSplits)).toHaveLength(1)

    useStore.getState().clearLootSplits()

    expect(useStore.getState().activeLootSplits).toEqual({})
  })
})
