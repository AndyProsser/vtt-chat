import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeHandoffToken, issueHandoffToken } from '@/services/handoff.service'

describe('handoff service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-18T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('issues and consumes a valid one-time token', () => {
    const issued = issueHandoffToken({
      userId: 'user-1',
      username: 'player-one',
      target: 'admin',
    })

    expect(issued.expiresInSec).toBe(60)

    const consumed = consumeHandoffToken(issued.handoffToken, 'admin')
    expect(consumed).toEqual({ userId: 'user-1', username: 'player-one' })

    const secondConsume = consumeHandoffToken(issued.handoffToken, 'admin')
    expect(secondConsume).toBeNull()
  })

  it('rejects handoff token for a mismatched target', () => {
    const issued = issueHandoffToken({
      userId: 'user-2',
      username: 'spectator-two',
      target: 'admin',
    })

    const consumed = consumeHandoffToken(issued.handoffToken, 'app')
    expect(consumed).toBeNull()

    const secondConsume = consumeHandoffToken(issued.handoffToken, 'admin')
    expect(secondConsume).toBeNull()
  })

  it('cleans up expired tokens before issuing or consuming', () => {
    const issued = issueHandoffToken({
      userId: 'user-3',
      username: 'late-user',
      target: 'app',
    })

    vi.advanceTimersByTime(61_000)

    const expiredConsume = consumeHandoffToken(issued.handoffToken, 'app')
    expect(expiredConsume).toBeNull()

    const fresh = issueHandoffToken({
      userId: 'user-4',
      username: 'fresh-user',
      target: 'app',
    })
    const freshConsume = consumeHandoffToken(fresh.handoffToken, 'app')

    expect(freshConsume).toEqual({ userId: 'user-4', username: 'fresh-user' })
  })

  it('returns null when token expires after cleanup but before final expiry guard', () => {
    const baseMs = Date.parse('2026-05-18T00:00:00.000Z')
    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(baseMs)
      .mockReturnValueOnce(baseMs)
      .mockReturnValueOnce(baseMs + 61_000)

    const issued = issueHandoffToken({
      userId: 'user-5',
      username: 'edge-user',
      target: 'app',
    })

    const consumed = consumeHandoffToken(issued.handoffToken, 'app')
    expect(consumed).toBeNull()

    nowSpy.mockRestore()
  })
})
