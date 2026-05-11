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
  it('normalizes compatibility lifecycle labels to canonical shared states', () => {
    expect(normalizeSessionState('INACTIVE')).toBe(SessionState.IDLE)
    expect(normalizeSessionState(SessionState.CLEANUP)).toBe(SessionState.CLEANUP)
    expect(normalizeSessionState(SessionState.ACTIVE)).toBe(SessionState.ACTIVE)
  })

  it('maps backend-only lifecycle states to public lifecycle states', () => {
    expect(toPublicSessionState(SessionState.IDLE)).toBe('INACTIVE')
    expect(toPublicSessionState(SessionState.CLEANUP)).toBe('INACTIVE')
    expect(toPublicSessionState(SessionState.ACTIVE)).toBe(SessionState.ACTIVE)
  })

  it('treats greenroom lifecycle labels as greenroom states', () => {
    expect(isGreenroomSessionState('INACTIVE')).toBe(true)
    expect(isGreenroomSessionState(SessionState.CLEANUP)).toBe(true)
    expect(isGreenroomSessionState(SessionState.ACTIVE)).toBe(false)
  })

  it('derives campaign display state from canonical session state', () => {
    expect(deriveCampaignDisplayState(null)).toBe('INACTIVE')
    expect(deriveCampaignDisplayState(SessionState.ACTIVE)).toBe('ACTIVE')
    expect(deriveCampaignDisplayState(SessionState.PAUSED)).toBe('PAUSED')
    expect(deriveCampaignDisplayState(SessionState.IDLE)).toBe('GREENROOM')
  })

  it('formats lifecycle states consistently for admin-facing labels', () => {
    expect(prettySessionState('INACTIVE')).toBe('Inactive')
    expect(prettySessionState(SessionState.CLEANUP)).toBe('Cleanup')
    expect(sessionStatusClass('INACTIVE')).toBe('status-idle')
    expect(sessionStatusClass(SessionState.CLEANUP)).toBe('status-idle')
  })
})
