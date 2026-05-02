import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '22222222-2222-4222-8222-222222222222'

const mocks = vi.hoisted(() => ({
  mockUserFindUnique: vi.fn(),
}))

vi.mock('@/infra/db', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: mocks.mockUserFindUnique,
    },
  }),
}))

import {
  getHandoffExchangeUser,
  getUserAuthContext,
  validateUserAuthState,
} from '@/services/auth-user-context.service'

describe('auth-user-context.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds enriched auth context for an existing user', async () => {
    mocks.mockUserFindUnique.mockResolvedValueOnce({
      id: USER_ID,
      username: 'dm-user',
      role: 'DM',
      adminRole: null,
      isActive: true,
      password: 'hash',
      displayName: 'DM User',
      avatarUrl: null,
      email: 'dm@example.com',
      tokenInvalidBefore: null,
      authType: 'FULL',
    })

    const result = await getUserAuthContext(USER_ID)

    expect(result).toMatchObject({
      id: USER_ID,
      hasAdminAccess: true,
      isFullAccount: true,
      requiresUpgradeForAdmin: false,
    })
  })

  it('returns token invalidated when issued before tokenInvalidBefore', async () => {
    mocks.mockUserFindUnique.mockResolvedValueOnce({
      isActive: true,
      tokenInvalidBefore: new Date('2026-05-02T12:00:00.000Z'),
    })

    const result = await validateUserAuthState(
      USER_ID,
      Math.floor(Date.parse('2026-05-02T11:59:59Z') / 1000)
    )

    expect(result).toEqual({ ok: false, code: 'TOKEN_INVALIDATED' })
  })

  it('returns inactive or missing when user is unavailable', async () => {
    mocks.mockUserFindUnique.mockResolvedValueOnce(null)

    const result = await validateUserAuthState(USER_ID, 0)

    expect(result).toEqual({ ok: false, code: 'INACTIVE_OR_MISSING' })
  })

  it('loads handoff exchange user projection', async () => {
    mocks.mockUserFindUnique.mockResolvedValueOnce({
      id: USER_ID,
      username: 'player-one',
      role: 'PLAYER',
      displayName: 'Player One',
      avatarUrl: null,
      isActive: true,
      adminRole: null,
      password: null,
      authType: 'GUEST',
    })

    const result = await getHandoffExchangeUser(USER_ID)

    expect(result).toMatchObject({
      id: USER_ID,
      username: 'player-one',
      authType: 'GUEST',
    })
  })
})
