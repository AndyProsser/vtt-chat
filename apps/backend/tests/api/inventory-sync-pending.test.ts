import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111'
const DM_ID = '22222222-2222-4222-8222-222222222222'
const PLAYER_ID = '33333333-3333-4333-8333-333333333333'
const PENDING_ID = '44444444-4444-4444-8444-444444444444'

const mocks = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockGetCampaignForUser: vi.fn(),
  mockListSessionsByCampaign: vi.fn(),
  mockSendMessage: vi.fn(),
  mockListPendingSyncsForCampaign: vi.fn(),
  mockApprovePendingSync: vi.fn(),
  mockRejectPendingSync: vi.fn(),
}))

vi.mock('@/services/auth.service', () => ({
  verifyToken: (...args: unknown[]) => mocks.mockVerifyToken(...args),
}))

vi.mock('@/repositories/campaign.repository', () => ({
  getCampaignForUser: (...args: unknown[]) => mocks.mockGetCampaignForUser(...args),
}))

vi.mock('@/repositories/session.repository', () => ({
  listSessionsByCampaign: (...args: unknown[]) => mocks.mockListSessionsByCampaign(...args),
}))

vi.mock('@/services/chat.service', () => ({
  sendMessage: (...args: unknown[]) => mocks.mockSendMessage(...args),
}))

vi.mock('@/services/inventory/pending-extension-sync.service', () => ({
  listPendingSyncsForCampaign: (...args: unknown[]) =>
    mocks.mockListPendingSyncsForCampaign(...args),
  approvePendingSync: (...args: unknown[]) => mocks.mockApprovePendingSync(...args),
  rejectPendingSync: (...args: unknown[]) => mocks.mockRejectPendingSync(...args),
}))

import inventorySyncRoutes from '@/api/inventory-sync.routes'

function buildApp(wsManager?: { broadcastToCampaignMembers: ReturnType<typeof vi.fn> }) {
  const app = express()
  app.use(express.json())
  if (wsManager) app.locals.wsManager = wsManager
  app.use('/api/inventory', inventorySyncRoutes)
  return app
}

describe('inventory extension sync review routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.mockVerifyToken.mockReturnValue({ userId: DM_ID, username: 'dm-one' })
    mocks.mockListSessionsByCampaign.mockResolvedValue([])
    mocks.mockSendMessage.mockResolvedValue({
      id: 'msg-1',
      createdAt: Date.now(),
      authorId: DM_ID,
      authorUsername: 'SYSTEM',
      content: '',
      type: 'SYSTEM',
    })
  })

  function asDm() {
    mocks.mockGetCampaignForUser.mockResolvedValue({ currentDmId: DM_ID, memberRole: null })
  }

  function asPlayer() {
    mocks.mockVerifyToken.mockReturnValue({ userId: PLAYER_ID, username: 'player-one' })
    mocks.mockGetCampaignForUser.mockResolvedValue({ currentDmId: DM_ID, memberRole: 'PLAYER' })
  }

  describe('GET /:campaignId/sync/pending', () => {
    it('returns 403 for a non-DM caller', async () => {
      asPlayer()
      const app = buildApp()

      const response = await request(app)
        .get(`/api/inventory/${CAMPAIGN_ID}/sync/pending`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(403)
      expect(response.body.code).toBe('FORBIDDEN')
    })

    it('returns the pending list for the DM', async () => {
      asDm()
      mocks.mockListPendingSyncsForCampaign.mockResolvedValueOnce([
        { id: PENDING_ID, kind: 'ITEM' },
      ])
      const app = buildApp()

      const response = await request(app)
        .get(`/api/inventory/${CAMPAIGN_ID}/sync/pending`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(200)
      expect(response.body.pending).toEqual([{ id: PENDING_ID, kind: 'ITEM' }])
    })
  })

  describe('POST /:campaignId/sync/pending/:pendingId/approve', () => {
    it('returns 403 for a non-DM caller', async () => {
      asPlayer()
      const app = buildApp()

      const response = await request(app)
        .post(`/api/inventory/${CAMPAIGN_ID}/sync/pending/${PENDING_ID}/approve`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(403)
    })

    it('returns 404 when the pending sync is missing or expired', async () => {
      asDm()
      mocks.mockApprovePendingSync.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' })
      const app = buildApp()

      const response = await request(app)
        .post(`/api/inventory/${CAMPAIGN_ID}/sync/pending/${PENDING_ID}/approve`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(404)
    })

    it('applies an ITEM pending sync and broadcasts INVENTORY:ITEM_ADDED', async () => {
      asDm()
      mocks.mockApprovePendingSync.mockResolvedValueOnce({
        ok: true,
        kind: 'ITEM',
        created: true,
        item: {
          id: 'item-1',
          campaignId: CAMPAIGN_ID,
          ownerType: 'character',
          ownerId: 'char-1',
          name: 'Longsword',
          quantity: 1,
          source: 'EXTERNAL',
          srdKey: null,
          srdCategory: 'EQUIPMENT',
          notes: null,
          externalId: 'ddb-item-1',
          externalSource: 'dndbeyond',
          addedByUserId: DM_ID,
          createdAt: 1000,
          updatedAt: 1000,
        },
      })
      const broadcastToCampaignMembers = vi.fn()
      const app = buildApp({ broadcastToCampaignMembers })

      const response = await request(app)
        .post(`/api/inventory/${CAMPAIGN_ID}/sync/pending/${PENDING_ID}/approve`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(200)
      expect(response.body.item.name).toBe('Longsword')
      expect(broadcastToCampaignMembers).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        expect.objectContaining({ type: 'INVENTORY:ITEM_ADDED' })
      )
    })

    it('applies a CURRENCY pending sync and broadcasts INVENTORY:CURRENCY_CHANGED', async () => {
      asDm()
      mocks.mockApprovePendingSync.mockResolvedValueOnce({
        ok: true,
        kind: 'CURRENCY',
        wallet: {
          id: 'wallet-1',
          campaignId: CAMPAIGN_ID,
          ownerType: 'character',
          ownerId: 'char-1',
          cp: 0,
          sp: 0,
          ep: 0,
          gp: 10,
          pp: 0,
          updatedAt: 1000,
        },
      })
      const broadcastToCampaignMembers = vi.fn()
      const app = buildApp({ broadcastToCampaignMembers })

      const response = await request(app)
        .post(`/api/inventory/${CAMPAIGN_ID}/sync/pending/${PENDING_ID}/approve`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(200)
      expect(response.body.wallet.gp).toBe(10)
      expect(broadcastToCampaignMembers).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        expect.objectContaining({ type: 'INVENTORY:CURRENCY_CHANGED' })
      )
    })
  })

  describe('POST /:campaignId/sync/pending/:pendingId/reject', () => {
    it('returns 403 for a non-DM caller', async () => {
      asPlayer()
      const app = buildApp()

      const response = await request(app)
        .post(`/api/inventory/${CAMPAIGN_ID}/sync/pending/${PENDING_ID}/reject`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(403)
    })

    it('returns 404 when the pending sync is missing or expired', async () => {
      asDm()
      mocks.mockRejectPendingSync.mockResolvedValueOnce(false)
      const app = buildApp()

      const response = await request(app)
        .post(`/api/inventory/${CAMPAIGN_ID}/sync/pending/${PENDING_ID}/reject`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(404)
    })

    it('discards the pending sync and returns 204', async () => {
      asDm()
      mocks.mockRejectPendingSync.mockResolvedValueOnce(true)
      const app = buildApp()

      const response = await request(app)
        .post(`/api/inventory/${CAMPAIGN_ID}/sync/pending/${PENDING_ID}/reject`)
        .set('Authorization', 'Bearer token')

      expect(response.status).toBe(204)
    })
  })
})
