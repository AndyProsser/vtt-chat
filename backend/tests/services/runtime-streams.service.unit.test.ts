import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  xAdd: vi.fn(),
  getRedisClient: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/infra/redis', () => ({
  getRedisClient: mocks.getRedisClient,
}))

vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils')>()
  return {
    ...actual,
    logger: {
      ...actual.logger,
      warn: mocks.warn,
    },
  }
})

import {
  appendChatRuntimeEvent,
  appendSessionAuditEvent,
} from '@/services/runtime/runtime-streams.service'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as any
const ROOM_ID = '22222222-2222-4222-8222-222222222222' as any
const USER_ID = '33333333-3333-4333-8333-333333333333' as any
const MESSAGE_ID = '44444444-4444-4444-8444-444444444444' as any

describe('runtime-streams.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRedisClient.mockResolvedValue({
      xAdd: mocks.xAdd,
    })
  })

  it('appends session audit event into Redis stream', async () => {
    await appendSessionAuditEvent({
      sessionId: SESSION_ID,
      actorUserId: USER_ID,
      actorRole: 'DM',
      actionType: 'CHAT.MESSAGE_SENT',
      targetType: 'MESSAGE',
      targetId: MESSAGE_ID,
      roomId: ROOM_ID,
      visibilityClass: 'PUBLIC',
      metadata: { test: true },
      timestamp: 1700000000000,
    })

    expect(mocks.xAdd).toHaveBeenCalledTimes(1)
    expect(mocks.xAdd).toHaveBeenCalledWith(
      `audit:session:${SESSION_ID}:stream`,
      '*',
      expect.objectContaining({
        sessionId: SESSION_ID,
        actionType: 'CHAT.MESSAGE_SENT',
        targetId: MESSAGE_ID,
        roomId: ROOM_ID,
        visibilityClass: 'PUBLIC',
      })
    )
  })

  it('appends chat runtime event into Redis stream', async () => {
    await appendChatRuntimeEvent({
      sessionId: SESSION_ID,
      messageId: MESSAGE_ID,
      action: 'MESSAGE_SENT',
      roomId: ROOM_ID,
      authorId: USER_ID,
      messageType: 'OOC',
      visibilityClass: 'PUBLIC',
      timestamp: 1700000001000,
      payload: {
        contentLength: 32,
      },
    })

    expect(mocks.xAdd).toHaveBeenCalledTimes(1)
    expect(mocks.xAdd).toHaveBeenCalledWith(
      `chat:session:${SESSION_ID}:stream`,
      '*',
      expect.objectContaining({
        sessionId: SESSION_ID,
        messageId: MESSAGE_ID,
        action: 'MESSAGE_SENT',
        roomId: ROOM_ID,
      })
    )
  })

  it('does not throw when Redis is unavailable', async () => {
    mocks.getRedisClient.mockRejectedValueOnce(new Error('redis unavailable'))

    await expect(
      appendSessionAuditEvent({
        sessionId: SESSION_ID,
        actionType: 'AUDIO.USER_MUTED',
        visibilityClass: 'ROLE_SCOPED',
      })
    ).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })
})
