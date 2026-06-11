import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEnvelope, UUID } from '@shared'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as UUID
const USER_A = '22222222-2222-4222-8222-222222222222' as UUID
const USER_B = '33333333-3333-4333-8333-333333333333' as UUID

const mocks = vi.hoisted(() => ({
  xAdd: vi.fn(),
  xTrim: vi.fn(),
  xRange: vi.fn(),
  del: vi.fn(),
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
  registerEventForRecoveryDurable,
  replayEventsForConnectionDurable,
} from '@/ws/state-recovery'

function makeEvent(id: string): EventEnvelope {
  return {
    id: id as UUID,
    type: 'CHAT:MESSAGE_SENT',
    version: 1,
    userId: USER_A,
    userRole: 'PLAYER' as any,
    sessionId: SESSION_ID,
    roomId: null,
    timestamp: Date.now(),
    payload: {
      id,
    },
  }
}

describe('state recovery durable replay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRedisClient.mockResolvedValue({
      xAdd: mocks.xAdd,
      xTrim: mocks.xTrim,
      xRange: mocks.xRange,
      del: mocks.del,
    })
  })

  it('registers durable recovery event with visibility metadata', async () => {
    const event = makeEvent('evt-1')

    await registerEventForRecoveryDurable(SESSION_ID, event, [USER_A])

    expect(mocks.xAdd).toHaveBeenCalledWith(
      `ws:session:${SESSION_ID}:events`,
      '*',
      expect.objectContaining({
        eventId: 'evt-1',
      })
    )
    expect(mocks.xTrim).toHaveBeenCalledWith(`ws:session:${SESSION_ID}:events`, 'MAXLEN', 1000)
  })

  it('replays only events after lastEventId and filters by visibleTo audience', async () => {
    const event1 = makeEvent('evt-1')
    const event2 = makeEvent('evt-2')
    const event3 = makeEvent('evt-3')

    mocks.xRange.mockResolvedValue([
      {
        id: '1-0',
        message: {
          event: JSON.stringify(event1),
          visibleTo: JSON.stringify([]),
        },
      },
      {
        id: '2-0',
        message: {
          event: JSON.stringify(event2),
          visibleTo: JSON.stringify([USER_B]),
        },
      },
      {
        id: '3-0',
        message: {
          event: JSON.stringify(event3),
          visibleTo: JSON.stringify([USER_A]),
        },
      },
    ])

    const replay = await replayEventsForConnectionDurable({
      sessionId: SESSION_ID,
      userId: USER_A,
      lastEventId: 'evt-1',
    })

    expect(replay.map((event) => event.id)).toEqual(['evt-3'])
  })

  it('falls back to full replay when lastEventId is unknown', async () => {
    const event1 = makeEvent('evt-1')
    const event2 = makeEvent('evt-2')

    mocks.xRange.mockResolvedValue([
      {
        id: '1-0',
        message: {
          event: JSON.stringify(event1),
          visibleTo: JSON.stringify([]),
        },
      },
      {
        id: '2-0',
        message: {
          event: JSON.stringify(event2),
          visibleTo: JSON.stringify([]),
        },
      },
    ])

    const replay = await replayEventsForConnectionDurable({
      sessionId: SESSION_ID,
      userId: USER_A,
      lastEventId: 'missing-id',
    })

    expect(replay.map((event) => event.id)).toEqual(['evt-1', 'evt-2'])
  })
})
