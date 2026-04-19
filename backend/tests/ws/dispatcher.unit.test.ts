import { describe, expect, it, vi } from 'vitest'
import { EventDispatcher } from '@/ws/dispatcher'
import { ErrorCode, type EventEnvelope, Role, type UUID } from '@shared'

function makeEvent(type: string, role: Role = Role.DM): EventEnvelope {
  return {
    id: '11111111-1111-4111-8111-111111111111' as UUID,
    type,
    version: 1,
    userId: '22222222-2222-4222-8222-222222222222' as UUID,
    userRole: role,
    sessionId: '33333333-3333-4333-8333-333333333333' as UUID,
    roomId: null,
    timestamp: Date.now(),
    payload: {},
  }
}

describe('EventDispatcher', () => {
  it('rejects invalid event envelopes', async () => {
    const dispatcher = new EventDispatcher()

    await expect(dispatcher.dispatch({ type: 'SESSION:CREATE' } as any)).rejects.toMatchObject({
      code: ErrorCode.INVALID_EVENT,
    })
  })

  it('denies events when role lacks permission', async () => {
    const dispatcher = new EventDispatcher()
    const event = makeEvent('SESSION:CREATE', Role.PLAYER)

    await expect(dispatcher.dispatch(event)).rejects.toMatchObject({
      code: ErrorCode.PERMISSION_DENIED,
    })
  })

  it('dispatches to all registered handlers in order', async () => {
    const dispatcher = new EventDispatcher()
    const calls: string[] = []
    const first = vi.fn(async () => {
      calls.push('first')
    })
    const second = vi.fn(async () => {
      calls.push('second')
    })

    dispatcher.registerHandler('SESSION:CREATE', first)
    dispatcher.registerHandler('SESSION:CREATE', second)

    await dispatcher.dispatch(makeEvent('SESSION:CREATE', Role.DM))

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['first', 'second'])
  })

  it('returns NOT_IMPLEMENTED when no handlers are registered', async () => {
    const dispatcher = new EventDispatcher()

    await expect(dispatcher.dispatch(makeEvent('SESSION:CREATE', Role.DM))).rejects.toMatchObject({
      code: ErrorCode.NOT_IMPLEMENTED,
    })
  })
})
