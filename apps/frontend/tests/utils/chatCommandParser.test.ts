/**
 * Chat Command Parser Tests
 * Covers slash detection, command lookup, role gating, and state gating.
 */

import { describe, it, expect } from 'vitest'
import { Role, SessionState } from '@shared'
import {
  parseChatInput,
  filterCommandsForAutocomplete,
  isCommandInput,
  getCommandsForRole,
} from '@/utils/chatCommandParser'

describe('isCommandInput', () => {
  it('returns true for strings starting with /', () => {
    expect(isCommandInput('/roll 1d20')).toBe(true)
    expect(isCommandInput('/me waves')).toBe(true)
    expect(isCommandInput('  /roll')).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(isCommandInput('hello there')).toBe(false)
    expect(isCommandInput('')).toBe(false)
    expect(isCommandInput('no slash here')).toBe(false)
  })
})

describe('parseChatInput', () => {
  it('returns ok:null for plain text', () => {
    const result = parseChatInput('hello', Role.PLAYER, SessionState.ACTIVE)
    expect(result.ok).toBeNull()
  })

  it('returns ok:true for a valid /roll command', () => {
    const result = parseChatInput('/roll 1d20', Role.PLAYER, SessionState.ACTIVE)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.command.name).toBe('roll')
      expect(result.command.args).toBe('1d20')
    }
  })

  it('is case-insensitive for command names', () => {
    const result = parseChatInput('/ROLL 2d6', Role.DM, SessionState.ACTIVE)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.command.name).toBe('roll')
  })

  it('returns error for unknown command', () => {
    const result = parseChatInput('/fly north', Role.DM, SessionState.ACTIVE)
    expect(result.ok).toBe(false)
    if (!result.ok && result.ok !== null) {
      expect(result.error.kind).toBe('UNKNOWN_COMMAND')
      expect(result.error.message).toMatch(/unknown command/i)
    }
  })

  it('returns error when role is not allowed', () => {
    // /dm is PLAYER-only
    const result = parseChatInput('/dm secret', Role.DM, SessionState.ACTIVE)
    expect(result.ok).toBe(false)
    if (!result.ok && result.ok !== null) {
      expect(result.error.kind).toBe('PERMISSION_DENIED')
    }
  })

  it('returns error when session state is not allowed', () => {
    // /roll is ACTIVE-only
    const result = parseChatInput('/roll 1d20', Role.PLAYER, SessionState.PAUSED)
    expect(result.ok).toBe(false)
    if (!result.ok && result.ok !== null) {
      expect(result.error.kind).toBe('UNAVAILABLE_IN_STATE')
    }
  })

  it('/OOC is available in PAUSED state', () => {
    const result = parseChatInput('/OOC brb', Role.PLAYER, SessionState.PAUSED)
    expect(result.ok).toBe(true)
  })

  it('/OOC is available in COOLDOWN state', () => {
    const result = parseChatInput('/OOC gg', Role.DM, SessionState.COOLDOWN)
    expect(result.ok).toBe(true)
  })

  it('captures multi-word args correctly', () => {
    const result = parseChatInput('/me draws their sword slowly', Role.PLAYER, SessionState.ACTIVE)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.command.args).toBe('draws their sword slowly')
    }
  })

  it('/whisper is available to both DM and PLAYER', () => {
    expect(parseChatInput('/whisper @Aria hello', Role.DM, SessionState.ACTIVE).ok).toBe(true)
    expect(parseChatInput('/whisper @Aria hello', Role.PLAYER, SessionState.ACTIVE).ok).toBe(true)
  })

  it('/dm is not available to SPECTATOR', () => {
    const result = parseChatInput('/dm hello', Role.SPECTATOR, SessionState.ACTIVE)
    expect(result.ok).toBe(false)
  })
})

describe('filterCommandsForAutocomplete', () => {
  it('returns empty array for non-command input', () => {
    expect(filterCommandsForAutocomplete('hello', Role.PLAYER)).toHaveLength(0)
  })

  it('returns all role-available commands for bare "/"', () => {
    const results = filterCommandsForAutocomplete('/', Role.PLAYER)
    expect(results.length).toBeGreaterThan(0)
    // /dm should be included (PLAYER-only)
    expect(results.some((c) => c.name === 'dm')).toBe(true)
  })

  it('does not return DM-only commands for PLAYER', () => {
    // All current commands allow PLAYER, so no exclusion test for players needed
    // But DM should not see /dm (PLAYER-only)
    const dmResults = filterCommandsForAutocomplete('/', Role.DM)
    expect(dmResults.some((c) => c.name === 'dm')).toBe(false)
  })

  it('filters by partial command word', () => {
    const results = filterCommandsForAutocomplete('/ro', Role.PLAYER)
    expect(results.some((c) => c.name === 'roll')).toBe(true)
    expect(results.every((c) => c.name.startsWith('ro') || c.slash.includes('ro'))).toBe(true)
  })

  it('returns empty once the user has typed a space (past command word)', () => {
    const results = filterCommandsForAutocomplete('/roll ', Role.PLAYER)
    expect(results).toHaveLength(0)
  })
})

describe('getCommandsForRole', () => {
  it('returns /dm for PLAYER but not DM', () => {
    const playerCommands = getCommandsForRole(Role.PLAYER)
    const dmCommands = getCommandsForRole(Role.DM)
    expect(playerCommands.some((c) => c.name === 'dm')).toBe(true)
    expect(dmCommands.some((c) => c.name === 'dm')).toBe(false)
  })

  it('returns /roll for both PLAYER and DM', () => {
    expect(getCommandsForRole(Role.PLAYER).some((c) => c.name === 'roll')).toBe(true)
    expect(getCommandsForRole(Role.DM).some((c) => c.name === 'roll')).toBe(true)
  })

  it('returns empty for SPECTATOR', () => {
    expect(getCommandsForRole(Role.SPECTATOR)).toHaveLength(0)
  })
})
