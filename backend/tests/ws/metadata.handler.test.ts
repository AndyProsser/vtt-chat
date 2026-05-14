import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'

const mocks = vi.hoisted(() => ({
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  broadcastToSession: vi.fn(),
}))

vi.mock('@/utils', () => ({
  logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/ws/event-broadcaster', () => ({
  default: {
    broadcastToSession: mocks.broadcastToSession,
  },
}))

import { metadataHandlers } from '@/ws/handlers/metadata.handler'

const BASE_EVENT: EventEnvelope = {
  id: '11111111-1111-4111-8111-111111111111' as UUID,
  type: 'METADATA:UPDATED',
  version: 1,
  userId: '22222222-2222-4222-8222-222222222222' as UUID,
  userRole: 'DM' as any,
  sessionId: '33333333-3333-4333-8333-333333333333' as UUID,
  roomId: null,
  timestamp: Date.now(),
  payload: {},
}

describe('metadata ws handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('broadcasts metadata updated events to the session', async () => {
    await metadataHandlers.handleMetadataUpdated({
      ...BASE_EVENT,
      payload: {
        entityType: 'SESSION',
        entityId: 'session-1',
        field: 'title',
      },
    })

    expect(mocks.loggerInfo).toHaveBeenCalled()
    expect(mocks.broadcastToSession).toHaveBeenCalledWith(BASE_EVENT.sessionId, expect.any(Object))
  })

  it('broadcasts character sheet updates to the session', async () => {
    await metadataHandlers.handleCharacterSheetUpdated({
      ...BASE_EVENT,
      type: 'METADATA:CHARACTER_SHEET_UPDATED',
      payload: {
        characterId: 'char-1',
        playerId: 'player-1',
      },
    })

    expect(mocks.broadcastToSession).toHaveBeenCalledWith(BASE_EVENT.sessionId, expect.any(Object))
  })

  it('broadcasts campaign data updates to the session', async () => {
    await metadataHandlers.handleCampaignDataUpdated({
      ...BASE_EVENT,
      type: 'METADATA:CAMPAIGN_DATA_UPDATED',
      payload: {
        campaignId: 'campaign-1',
        field: 'worldName',
      },
    })

    expect(mocks.broadcastToSession).toHaveBeenCalledWith(BASE_EVENT.sessionId, expect.any(Object))
  })

  it('logs errors when metadata handler throws', async () => {
    mocks.broadcastToSession.mockImplementation(() => {
      throw new Error('broadcast failed')
    })

    await metadataHandlers.handleTemplateApplied({
      ...BASE_EVENT,
      type: 'METADATA:TEMPLATE_APPLIED',
      payload: {
        templateId: 'template-1',
        templateName: 'Monster',
      },
    })

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'metadata',
      expect.stringContaining('Error handling METADATA:TEMPLATE_APPLIED')
    )
  })
})
