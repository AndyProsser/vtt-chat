import { beforeEach, describe, expect, it, vi } from 'vitest'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const CHARACTER_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const PENDING_ID = '44444444-4444-4444-8444-444444444444'

const NOW = new Date('2026-06-16T00:00:00.000Z')

const mocks = vi.hoisted(() => ({
  mockCreatePendingExtensionSyncRecord: vi.fn(),
  mockListPendingExtensionSyncs: vi.fn(),
  mockFindPendingExtensionSyncById: vi.fn(),
  mockDeletePendingExtensionSyncRecord: vi.fn(),
  mockSyncExternalInventoryItems: vi.fn(),
  mockSetExternalCurrencyWallet: vi.fn(),
}))

vi.mock('@/repositories/pending-extension-sync.repository', () => ({
  createPendingExtensionSyncRecord: mocks.mockCreatePendingExtensionSyncRecord,
  listPendingExtensionSyncs: mocks.mockListPendingExtensionSyncs,
  findPendingExtensionSyncById: mocks.mockFindPendingExtensionSyncById,
  deletePendingExtensionSyncRecord: mocks.mockDeletePendingExtensionSyncRecord,
}))

vi.mock('@/services/inventory/inventory.service', () => ({
  syncExternalInventoryItems: mocks.mockSyncExternalInventoryItems,
  setExternalCurrencyWallet: mocks.mockSetExternalCurrencyWallet,
}))

import {
  queuePendingItemConflict,
  queuePendingCurrencyConflict,
  listPendingSyncsForCampaign,
  approvePendingSync,
  rejectPendingSync,
} from '@/services/inventory/pending-extension-sync.service'

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PENDING_ID,
    campaignId: CAMPAIGN_ID,
    characterId: CHARACTER_ID,
    externalSource: 'dndbeyond',
    externalId: 'ddb-item-1',
    kind: 'ITEM' as const,
    incomingPayload: { externalId: 'ddb-item-1', name: 'Longsword', quantity: 1 },
    existingSnapshot: { name: 'Old Sword', quantity: 1 },
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
    ...overrides,
  }
}

describe('pending-extension-sync.service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('queuePendingItemConflict persists an ITEM row and returns its id', async () => {
    mocks.mockCreatePendingExtensionSyncRecord.mockResolvedValueOnce(buildRow())

    const id = await queuePendingItemConflict({
      campaignId: CAMPAIGN_ID,
      characterId: CHARACTER_ID,
      externalSource: 'dndbeyond',
      externalId: 'ddb-item-1',
      incomingItem: { externalId: 'ddb-item-1', name: 'Longsword', quantity: 1 },
      existingSnapshot: { name: 'Old Sword', quantity: 1 },
    } as any)

    expect(id).toBe(PENDING_ID)
    expect(mocks.mockCreatePendingExtensionSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: CAMPAIGN_ID, characterId: CHARACTER_ID, kind: 'ITEM' })
    )
  })

  it('queuePendingCurrencyConflict persists a CURRENCY row keyed by externalId "currency"', async () => {
    mocks.mockCreatePendingExtensionSyncRecord.mockResolvedValueOnce(
      buildRow({ kind: 'CURRENCY', externalId: 'currency' })
    )

    const id = await queuePendingCurrencyConflict({
      campaignId: CAMPAIGN_ID,
      characterId: CHARACTER_ID,
      externalSource: 'dndbeyond',
      incomingWallet: { gp: 10 },
      existingSnapshot: { gp: 50 },
    } as any)

    expect(id).toBe(PENDING_ID)
    expect(mocks.mockCreatePendingExtensionSyncRecord).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'CURRENCY', externalId: 'currency' })
    )
  })

  it('listPendingSyncsForCampaign maps rows to DTOs with numeric timestamps', async () => {
    mocks.mockListPendingExtensionSyncs.mockResolvedValueOnce([buildRow()])

    const dtos = await listPendingSyncsForCampaign(CAMPAIGN_ID as any)

    expect(dtos).toHaveLength(1)
    expect(dtos[0]).toMatchObject({ id: PENDING_ID, campaignId: CAMPAIGN_ID, kind: 'ITEM' })
    expect(typeof dtos[0].createdAt).toBe('number')
    expect(typeof dtos[0].expiresAt).toBe('number')
  })

  it('approvePendingSync applies an ITEM pending sync and deletes the record', async () => {
    mocks.mockFindPendingExtensionSyncById.mockResolvedValueOnce(buildRow())
    mocks.mockSyncExternalInventoryItems.mockResolvedValueOnce({
      upserted: [{ id: 'item-1', name: 'Longsword' }],
      created: 0,
      updated: 1,
    })

    const result = await approvePendingSync({
      pendingId: PENDING_ID as any,
      campaignId: CAMPAIGN_ID as any,
      actorUserId: USER_ID as any,
    })

    expect(result).toEqual({
      ok: true,
      kind: 'ITEM',
      item: { id: 'item-1', name: 'Longsword' },
      created: false,
    })
    expect(mocks.mockSyncExternalInventoryItems).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        ownerId: CHARACTER_ID,
        externalSource: 'dndbeyond',
        items: [{ externalId: 'ddb-item-1', name: 'Longsword', quantity: 1 }],
      })
    )
    expect(mocks.mockDeletePendingExtensionSyncRecord).toHaveBeenCalledWith(PENDING_ID)
  })

  it('approvePendingSync applies a CURRENCY pending sync and deletes the record', async () => {
    mocks.mockFindPendingExtensionSyncById.mockResolvedValueOnce(
      buildRow({ kind: 'CURRENCY', externalId: 'currency', incomingPayload: { gp: 10 } })
    )
    mocks.mockSetExternalCurrencyWallet.mockResolvedValueOnce({ id: 'wallet-1', gp: 10 })

    const result = await approvePendingSync({
      pendingId: PENDING_ID as any,
      campaignId: CAMPAIGN_ID as any,
      actorUserId: USER_ID as any,
    })

    expect(result).toEqual({ ok: true, kind: 'CURRENCY', wallet: { id: 'wallet-1', gp: 10 } })
    expect(mocks.mockSetExternalCurrencyWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        ownerId: CHARACTER_ID,
        wallet: { gp: 10 },
      })
    )
    expect(mocks.mockDeletePendingExtensionSyncRecord).toHaveBeenCalledWith(PENDING_ID)
  })

  it('approvePendingSync returns NOT_FOUND for a missing or expired pending sync', async () => {
    mocks.mockFindPendingExtensionSyncById.mockResolvedValueOnce(null)

    const result = await approvePendingSync({
      pendingId: PENDING_ID as any,
      campaignId: CAMPAIGN_ID as any,
      actorUserId: USER_ID as any,
    })

    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' })
    expect(mocks.mockSyncExternalInventoryItems).not.toHaveBeenCalled()
    expect(mocks.mockDeletePendingExtensionSyncRecord).not.toHaveBeenCalled()
  })

  it('rejectPendingSync deletes the record and returns true', async () => {
    mocks.mockFindPendingExtensionSyncById.mockResolvedValueOnce(buildRow())

    const rejected = await rejectPendingSync({
      pendingId: PENDING_ID as any,
      campaignId: CAMPAIGN_ID as any,
    })

    expect(rejected).toBe(true)
    expect(mocks.mockDeletePendingExtensionSyncRecord).toHaveBeenCalledWith(PENDING_ID)
    expect(mocks.mockSyncExternalInventoryItems).not.toHaveBeenCalled()
    expect(mocks.mockSetExternalCurrencyWallet).not.toHaveBeenCalled()
  })

  it('rejectPendingSync returns false for a missing or expired pending sync', async () => {
    mocks.mockFindPendingExtensionSyncById.mockResolvedValueOnce(null)

    const rejected = await rejectPendingSync({
      pendingId: PENDING_ID as any,
      campaignId: CAMPAIGN_ID as any,
    })

    expect(rejected).toBe(false)
    expect(mocks.mockDeletePendingExtensionSyncRecord).not.toHaveBeenCalled()
  })
})
