/**
 * lootSplitSlice — deprecated tests
 * The loot-split accept flow was replaced by an immediate server-side split.
 * The lootSplitSlice and its WS handlers have been removed.
 * This file is kept as a placeholder so the test runner doesn't error on the path.
 */

import { describe, it, expect } from 'vitest'

describe('lootSplitSlice (removed)', () => {
  it('is a no-op — the accept flow no longer exists', () => {
    expect(true).toBe(true)
  })
})
