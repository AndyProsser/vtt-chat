import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignTransferBundle } from '@/types/portability.types'

const mocks = vi.hoisted(() => ({
  mockCampaignFindUnique: vi.fn(),
  mockArtifactCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockRecordingFindMany: vi.fn(),
  mockRecordingCreate: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    campaign: { findUnique: mocks.mockCampaignFindUnique },
    importExportArtifact: { create: mocks.mockArtifactCreate },
    $transaction: mocks.mockTransaction,
    recordingMetadata: {
      findMany: mocks.mockRecordingFindMany,
      create: mocks.mockRecordingCreate,
    },
  }),
}))

import {
  buildCampaignExport,
  createOperationalExportArtifact,
  createRecordingMetadata,
  defaultRecordingState,
  importCampaignBundle,
  isValidTransferBundle,
  listRecordingMetadata,
  portabilityArtifactTypeLabel,
} from '@/services/admin.service'

const NOW = new Date('2026-05-02T00:00:00.000Z')

function makeBundle(): CampaignTransferBundle {
  return {
    version: 1,
    exportedAt: NOW.toISOString(),
    sourceCampaignId: 'campaign-source',
    campaign: {
      name: 'Imported Campaign',
      description: 'desc',
      inviteCode: 'INV123',
      currentDmId: 'dm-source',
      currentDmUsername: 'source-dm',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
    members: [
      {
        userId: 'dm-source',
        username: 'source-dm',
        displayName: 'Source DM',
        campaignRole: 'DM',
        userRole: 'DM',
      },
      {
        userId: 'player-source',
        username: 'source-player',
        displayName: 'Source Player',
        campaignRole: 'PLAYER',
        userRole: 'PLAYER',
      },
    ],
    characters: [
      {
        userId: 'player-source',
        name: 'Ari',
        status: 'ALIVE',
        race: 'Elf',
        class: 'Wizard',
        subclass: 'Evoker',
        avatarUrl: null,
        isActive: true,
        metadata: { level: 3 },
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
    sessions: [
      {
        id: 'session-source',
        name: 'Session 1',
        description: 'First',
        state: 'ACTIVE',
        createdAt: NOW.toISOString(),
        startedAt: NOW.toISOString(),
        endedAt: null,
        updatedAt: NOW.toISOString(),
        rooms: [
          {
            id: 'room-source',
            name: 'Main',
            type: 'MAIN',
            createdBy: 'dm-source',
            createdAt: NOW.toISOString(),
            updatedAt: NOW.toISOString(),
          },
        ],
        members: [
          {
            userId: 'player-source',
            username: 'source-player',
            role: 'PLAYER',
            joinedAt: NOW.toISOString(),
          },
        ],
        messages: [
          {
            authorId: 'player-source',
            authorUsername: 'source-player',
            content: 'hello',
            type: 'OOC',
            isDmOnly: false,
            visibleTo: ['player-source'],
            createdAt: NOW.toISOString(),
            editedAt: null,
            deletedAt: null,
            deletedBy: null,
          },
        ],
        notes: [
          {
            authorId: 'player-source',
            authorUsername: 'source-player',
            title: 'n1',
            content: 'c1',
            visibility: 'CUSTOM',
            tags: ['tag'],
            allowedUsers: ['player-source'],
            publishedAt: null,
            createdAt: NOW.toISOString(),
            updatedAt: NOW.toISOString(),
          },
        ],
        logs: [
          {
            userId: 'player-source',
            username: 'source-player',
            eventType: 'JOINED',
            detail: 'joined',
            createdAt: NOW.toISOString(),
          },
        ],
      },
    ],
    recordings: [
      {
        title: 'Rec',
        sessionId: 'session-source',
        roomId: 'room-source',
        storageKey: 's3/key',
        sourceUrl: 'https://example.com',
        durationSeconds: 300,
        startedAt: NOW.toISOString(),
        endedAt: NOW.toISOString(),
        journalSummary: 'sum',
        metadata: { codec: 'opus' },
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    ],
  }
}

describe('admin-portability.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('buildCampaignExport returns null for missing campaign', async () => {
    mocks.mockCampaignFindUnique.mockResolvedValue(null)

    const result = await buildCampaignExport('missing')

    expect(result).toBeNull()
  })

  it('buildCampaignExport serializes campaign bundle and metadata counts', async () => {
    const campaign = {
      id: 'campaign-1',
      name: 'C1',
      description: 'desc',
      inviteCode: 'INV123',
      currentDmId: 'dm-1',
      createdAt: NOW,
      updatedAt: NOW,
      currentDm: { id: 'dm-1', username: 'dm-user' },
      members: [
        {
          userId: 'dm-1',
          role: 'DM',
          user: { id: 'dm-1', username: 'dm-user', displayName: 'DM', role: 'DM' },
        },
      ],
      characters: [],
      sessions: [],
      recordings: [],
    }

    mocks.mockCampaignFindUnique.mockResolvedValue(campaign)
    mocks.mockArtifactCreate.mockResolvedValue({ id: 'artifact-1' })

    const result = await buildCampaignExport('campaign-1', 'actor-1')

    expect(result?.artifactId).toBe('artifact-1')
    expect(result?.counts).toEqual({
      members: 1,
      characters: 0,
      sessions: 0,
      rooms: 0,
      messages: 0,
      notes: 0,
      logs: 0,
      recordings: 0,
    })
    expect(mocks.mockArtifactCreate).toHaveBeenCalledTimes(1)
  })

  it('importCampaignBundle returns null for invalid payload', async () => {
    const result = await importCampaignBundle('actor-1', { bad: true })

    expect(result).toBeNull()
    expect(mocks.mockTransaction).not.toHaveBeenCalled()
  })

  it('importCampaignBundle imports members, session trees, and recordings', async () => {
    const bundle = makeBundle()

    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'player-mapped' }),
      },
      campaign: {
        create: vi.fn().mockResolvedValue({
          id: 'campaign-imported',
          name: 'Imported Campaign',
          inviteCode: 'NEW123',
          currentDmId: 'actor-1',
          createdAt: NOW,
          updatedAt: NOW,
        }),
      },
      campaignMembership: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      character: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      session: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      room: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      sessionMember: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      chatMessage: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      note: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      sessionLog: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      recordingMetadata: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      importExportArtifact: { create: vi.fn().mockResolvedValue({ id: 'artifact-import-1' }) },
    }

    mocks.mockTransaction.mockImplementation(async (cb: (trx: typeof tx) => Promise<unknown>) =>
      cb(tx)
    )

    const result = await importCampaignBundle('actor-1', bundle)

    expect(result).toBeTruthy()
    expect(result?.artifactId).toBe('artifact-import-1')
    expect(tx.campaignMembership.createMany).toHaveBeenCalledTimes(1)
    expect(tx.session.createMany).toHaveBeenCalledTimes(1)
    expect(tx.room.createMany).toHaveBeenCalledTimes(1)
    expect(tx.chatMessage.createMany).toHaveBeenCalledTimes(1)
    expect(tx.recordingMetadata.createMany).toHaveBeenCalledTimes(1)
  })

  it('lists and creates recording metadata via prisma passthrough', async () => {
    mocks.mockRecordingFindMany.mockResolvedValue([{ id: 'rec-1' }])
    mocks.mockRecordingCreate.mockResolvedValue({ id: 'rec-2' })

    const list = await listRecordingMetadata('campaign-1')
    const created = await createRecordingMetadata({
      campaignId: 'campaign-1',
      title: 'Session Mix',
      durationSeconds: 123,
    })

    expect(list).toEqual([{ id: 'rec-1' }])
    expect(created).toEqual({ id: 'rec-2' })
  })

  it('creates operations export artifact with bundled payload metadata', async () => {
    mocks.mockArtifactCreate.mockResolvedValue({ id: 'ops-1' })

    const result = await createOperationalExportArtifact(
      'actor-1',
      { maintenanceMode: 'off' },
      [{ id: 't1' }],
      [{ id: 'd1' }],
      [{ id: 'a1' }]
    )

    expect(result.artifactId).toBe('ops-1')
    expect(result.bundle.version).toBe(1)
    expect(mocks.mockArtifactCreate).toHaveBeenCalledTimes(1)
  })

  it('validates transfer bundle and utility labels/states', () => {
    expect(isValidTransferBundle(makeBundle())).toBe(true)
    expect(isValidTransferBundle({ foo: 'bar' })).toBe(false)

    expect(portabilityArtifactTypeLabel('CAMPAIGN_EXPORT' as any)).toBe('Campaign export')
    expect(portabilityArtifactTypeLabel('CAMPAIGN_IMPORT' as any)).toBe('Campaign import')
    expect(portabilityArtifactTypeLabel('OPERATIONS_EXPORT' as any)).toBe('Operations export')

    expect(defaultRecordingState()).toBe('OFFLINE')
  })
})
