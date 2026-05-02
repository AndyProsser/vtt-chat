import { getPrismaClient } from '@/infra/db'
import type {
  HandoffExchangeUser,
  UserAuthContext,
  ValidateUserAuthStateResult,
} from '@/types/auth-user-context.types'

const prisma = getPrismaClient()

export async function getUserAuthContext(userId: string): Promise<UserAuthContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      adminRole: true,
      isActive: true,
      password: true,
      displayName: true,
      avatarUrl: true,
      email: true,
      tokenInvalidBefore: true,
      authType: true,
    },
  })

  if (!user) {
    return null
  }

  const isFullAccount = user.authType === 'FULL'
  const hasAdminAccess = Boolean(user.adminRole) || user.role === 'DM'

  return {
    ...user,
    isFullAccount,
    hasAdminAccess,
    requiresUpgradeForAdmin: user.authType === 'GUEST',
  }
}

export async function getHandoffExchangeUser(userId: string): Promise<HandoffExchangeUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      role: true,
      displayName: true,
      avatarUrl: true,
      isActive: true,
      adminRole: true,
      password: true,
      authType: true,
    },
  })
}

export async function validateUserAuthState(
  userId: string,
  tokenIat?: number
): Promise<ValidateUserAuthStateResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, tokenInvalidBefore: true },
  })

  if (!user || !user.isActive) {
    return { ok: false, code: 'INACTIVE_OR_MISSING' }
  }

  if (user.tokenInvalidBefore) {
    const issuedAtMs = (tokenIat || 0) * 1000
    if (issuedAtMs < user.tokenInvalidBefore.getTime()) {
      return { ok: false, code: 'TOKEN_INVALIDATED' }
    }
  }

  return { ok: true }
}
