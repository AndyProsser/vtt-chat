import { describe, expect, it } from 'vitest'
import { SessionState } from '@shared'
import { prettyState, statusClass } from '@/types/campaigns'

describe('shared alignment (admin)', () => {
  it('maps session state labels consistently', () => {
    expect(prettyState(SessionState.IDLE)).toBe('Idle')
    expect(prettyState(SessionState.ACTIVE)).toBe('Active')
    expect(prettyState(SessionState.PAUSED)).toBe('Paused')
    expect(prettyState(SessionState.ENDED)).toBe('Ended')
  })

  it('maps status classes consistently', () => {
    expect(statusClass(SessionState.ACTIVE)).toBe('status-active')
    expect(statusClass(SessionState.PAUSED)).toBe('status-paused')
    expect(statusClass(SessionState.ENDED)).toBe('status-ended')
    expect(statusClass(SessionState.IDLE)).toBe('status-idle')
    expect(statusClass('NO_SESSION')).toBe('status-none')
  })
})
