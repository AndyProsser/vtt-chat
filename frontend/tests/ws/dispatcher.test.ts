import { describe, expect, it, vi } from 'vitest'
import type { UUID } from '@shared'
import { EventDispatcher } from '../../src/ws/dispatcher'
import type { EventEnvelope } from '@shared'

const BASE: EventEnvelope = {
  id: '00000000-0000-4000-8000-000000000000' as UUID,
  type: 'CHAT:MESSAGE_SENT',
  version: 1,
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as UUID,
  userRole: 'PLAYER' as any,
  sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' as UUID,
  roomId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' as UUID,
  timestamp: 1700000000000,
  payload: {},
}

function makeEvent(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return { ...BASE, ...overrides }
}

describe('EventDispatcher', () => {
  // ── Registration & exact-match dispatch ────────────────────────────────────

  it('dispatches an event to a registered exact-match handler', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', handler)

    dispatcher.dispatch(makeEvent())

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'CHAT:MESSAGE_SENT' }))
  })

  it('does not invoke a handler registered for a different event type', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('ROOM:CREATED', handler)

    dispatcher.dispatch(makeEvent({ type: 'CHAT:MESSAGE_SENT' }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('calls multiple handlers registered for the same event type', () => {
    const dispatcher = new EventDispatcher()
    const h1 = vi.fn()
    const h2 = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', h1)
    dispatcher.register('CHAT:MESSAGE_SENT', h2)

    dispatcher.dispatch(makeEvent())

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  // ── Wildcard dispatch ──────────────────────────────────────────────────────

  it('dispatches via wildcard pattern (CHAT:*)', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('CHAT:*', handler)

    dispatcher.dispatch(makeEvent({ type: 'CHAT:MESSAGE_SENT' }))
    dispatcher.dispatch(makeEvent({ type: 'CHAT:TYPING_STARTED' }))

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('does not match wildcard across namespace boundary', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('CHAT:*', handler)

    dispatcher.dispatch(makeEvent({ type: 'ROOM:CREATED' }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('dispatches via global wildcard (*)', () => {
    const dispatcher = new EventDispatcher()
    const globalHandler = vi.fn()
    dispatcher.register('*', globalHandler)

    dispatcher.dispatch(makeEvent({ type: 'AUDIO:ENVIRONMENT_SET' }))
    dispatcher.dispatch(makeEvent({ type: 'ROOM:DELETED' }))

    expect(globalHandler).toHaveBeenCalledTimes(2)
  })

  it('invokes both exact and wildcard handlers for the same event', () => {
    const dispatcher = new EventDispatcher()
    const exact = vi.fn()
    const wildcard = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', exact)
    dispatcher.register('CHAT:*', wildcard)

    dispatcher.dispatch(makeEvent())

    expect(exact).toHaveBeenCalledOnce()
    expect(wildcard).toHaveBeenCalledOnce()
  })

  // ── Unregister ─────────────────────────────────────────────────────────────

  it('stops invoking a handler after unregister', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', handler)
    dispatcher.unregister('CHAT:MESSAGE_SENT', handler)

    dispatcher.dispatch(makeEvent())

    expect(handler).not.toHaveBeenCalled()
  })

  it('unregister is a no-op when handler was not registered', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()

    expect(() => {
      dispatcher.unregister('CHAT:MESSAGE_SENT', handler)
    }).not.toThrow()
  })

  // ── Validation ─────────────────────────────────────────────────────────────

  it('drops an event with invalid version', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', handler)

    dispatcher.dispatch(makeEvent({ version: 2 as any }))

    expect(handler).not.toHaveBeenCalled()
  })

  it('drops an event missing userId', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', handler)

    const { userId: _, ...noUserId } = BASE
    dispatcher.dispatch(noUserId as any)

    expect(handler).not.toHaveBeenCalled()
  })

  it('drops an event missing payload', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', handler)

    const { payload: _, ...noPayload } = BASE
    dispatcher.dispatch(noPayload as any)

    expect(handler).not.toHaveBeenCalled()
  })

  it('drops an event with zero timestamp', () => {
    const dispatcher = new EventDispatcher()
    const handler = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', handler)

    dispatcher.dispatch(makeEvent({ timestamp: 0 }))

    expect(handler).not.toHaveBeenCalled()
  })

  // ── Error isolation ────────────────────────────────────────────────────────

  it('continues dispatching to remaining handlers if one throws', () => {
    const dispatcher = new EventDispatcher()
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    dispatcher.register('CHAT:MESSAGE_SENT', bad)
    dispatcher.register('CHAT:MESSAGE_SENT', good)

    expect(() => dispatcher.dispatch(makeEvent())).not.toThrow()

    expect(bad).toHaveBeenCalledOnce()
    expect(good).toHaveBeenCalledOnce()
  })
})
