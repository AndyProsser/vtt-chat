import { describe, expect, it } from 'vitest'
import {
  SessionState,
  deriveCampaignDisplayState,
  isGreenroomSessionState,
  normalizeSessionState,
  prettySessionState,
  sessionStatusClass,
  toPublicSessionState,
} from '@shared'

describe('session state utilities', () => {
  it('normalizes lifecycle labels to canonical shared states', () => {
    expect(normalizeSessionState(SessionState.IDLE)).toBe(SessionState.IDLE)
    expect(normalizeSessionState(SessionState.CLEANUP)).toBe(SessionState.CLEANUP)
    expect(normalizeSessionState(SessionState.ACTIVE)).toBe(SessionState.ACTIVE)
  })

  it('keeps lifecycle states canonical for public usage', () => {
    expect(toPublicSessionState(SessionState.IDLE)).toBe(SessionState.IDLE)
    expect(toPublicSessionState(SessionState.CLEANUP)).toBe(SessionState.CLEANUP)
    expect(toPublicSessionState(SessionState.ACTIVE)).toBe(SessionState.ACTIVE)
  })

  it('treats greenroom lifecycle labels as greenroom states', () => {
    expect(isGreenroomSessionState(SessionState.IDLE)).toBe(true)
    expect(isGreenroomSessionState(SessionState.CLEANUP)).toBe(true)
    expect(isGreenroomSessionState(SessionState.ACTIVE)).toBe(false)
  })

  it('derives campaign display state from canonical session state', () => {
    expect(deriveCampaignDisplayState(null)).toBe('IDLE')
    expect(deriveCampaignDisplayState(SessionState.ACTIVE)).toBe('ACTIVE')
    expect(deriveCampaignDisplayState(SessionState.PAUSED)).toBe('PAUSED')
    expect(deriveCampaignDisplayState(SessionState.IDLE)).toBe('GREENROOM')
  })

  it('formats lifecycle states consistently for admin-facing labels', () => {
    expect(prettySessionState(SessionState.IDLE)).toBe('Idle')
    expect(prettySessionState(SessionState.CLEANUP)).toBe('Cleanup')
    expect(sessionStatusClass(SessionState.IDLE)).toBe('status-idle')
    expect(sessionStatusClass(SessionState.CLEANUP)).toBe('status-idle')
  })
})
