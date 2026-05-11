import { describe, expect, it } from 'vitest'
import {
  SessionState,
  deriveCampaignDisplayState,
  isGreenroomSessionState,
  normalizeSessionState,
  prettySessionState,
  sessionStatusClass,
} from '@shared'

describe('session state utilities', () => {
  it('normalizes compatibility lifecycle labels to canonical shared states', () => {
    expect(normalizeSessionState('INACTIVE')).toBe(SessionState.IDLE)
    expect(normalizeSessionState('CLEANUP')).toBe(SessionState.ENDED)
    expect(normalizeSessionState(SessionState.ACTIVE)).toBe(SessionState.ACTIVE)
  })

  it('treats greenroom lifecycle labels as greenroom states', () => {
    expect(isGreenroomSessionState('INACTIVE')).toBe(true)
    expect(isGreenroomSessionState('CLEANUP')).toBe(true)
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
    expect(prettySessionState('CLEANUP')).toBe('Cleanup')
    expect(sessionStatusClass('INACTIVE')).toBe('status-idle')
    expect(sessionStatusClass('CLEANUP')).toBe('status-idle')
  })
})
