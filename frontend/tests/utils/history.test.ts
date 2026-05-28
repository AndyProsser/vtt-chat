import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HISTORY_GROUP_BY,
  DEFAULT_HISTORY_SORT_ORDER,
  formatEventLabel,
  getHistoryControlStorageKey,
  parsePersistedHistoryControls,
} from '../../src/utils/history'

describe('history utils', () => {
  it('builds storage keys using user scope when provided', () => {
    expect(
      getHistoryControlStorageKey(
        '11111111-1111-4111-8111-111111111111' as any,
        'PLAYER' as any,
        '22222222-2222-4222-8222-222222222222' as any
      )
    ).toBe(
      'vtt-chat:history:controls:22222222-2222-4222-8222-222222222222:11111111-1111-4111-8111-111111111111'
    )
  })

  it('falls back to role scope when no user id is provided', () => {
    expect(
      getHistoryControlStorageKey('11111111-1111-4111-8111-111111111111' as any, 'DM' as any)
    ).toBe('vtt-chat:history:controls:DM:11111111-1111-4111-8111-111111111111')
  })

  it('returns defaults for missing or invalid persisted controls', () => {
    expect(parsePersistedHistoryControls(null)).toEqual({
      groupBy: DEFAULT_HISTORY_GROUP_BY,
      sortOrder: DEFAULT_HISTORY_SORT_ORDER,
    })
    expect(parsePersistedHistoryControls('{bad json')).toEqual({
      groupBy: DEFAULT_HISTORY_GROUP_BY,
      sortOrder: DEFAULT_HISTORY_SORT_ORDER,
    })
  })

  it('parses valid persisted controls and falls back unknown values selectively', () => {
    expect(parsePersistedHistoryControls(JSON.stringify({ groupBy: 'day', sortOrder: 'oldest' }))).toEqual({
      groupBy: 'day',
      sortOrder: 'oldest',
    })

    expect(
      parsePersistedHistoryControls(JSON.stringify({ groupBy: 'weird', sortOrder: 'newest' }))
    ).toEqual({
      groupBy: DEFAULT_HISTORY_GROUP_BY,
      sortOrder: 'newest',
    })
  })

  it('formats event labels from snake case', () => {
    expect(formatEventLabel('ROOM_USER_JOINED')).toBe('Room User Joined')
  })
})
