/**
 * Authentication Service
 * Handles JWT creation, verification, and password hashing.
 * Pure, deterministic logic for token management.
 */

import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import type { TokenPayload } from '@/types/auth.types'
import { config } from '@/infra/config'
import { getPrismaClient } from '@/infra/db'
import type {
  HandoffExchangeUser,
  UserAuthContext,
  ValidateUserAuthStateResult,
} from '@/types/auth-user-context.types'
import type { UUID } from '@shared'

const BCRYPT_ROUNDS = 10
const JWT_ISSUER = 'vtt-chat'
const prisma = getPrismaClient()

export type { TokenPayload } from '@/types/auth.types'

/**
 * Hash a password (for user registration/password change)
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Create a JWT token for a user
 */
export function createToken(payload: TokenPayload): string {
  return jwt.sign(
    {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      accessMode: payload.accessMode || 'CAMPAIGN',
      authType: payload.authType || 'FULL',
      sessionId: payload.sessionId,
    } as any,
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
      issuer: JWT_ISSUER,
    } as any
  )
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: JWT_ISSUER,
    }) as TokenPayload
    return decoded
  } catch {
    return null
  }
}

/**
 * Extract token from Authorization header
 * Format: "Bearer <token>"
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) return null
  const [scheme, token] = authHeader.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

/**
 * Refresh a token (validate old token and issue new one)
 */
export function refreshToken(oldToken: string): string | null {
  const payload = verifyToken(oldToken)
  if (!payload) return null
  return createToken(payload)
}

/**
 * Check if a token is expired
 */
export function isTokenExpired(token: string): boolean {
  const payload = verifyToken(token)
  return payload === null
}

/**
 * Decode token without verification (use cautiously)
 */
export function decodeTokenUnsafe(token: string): TokenPayload | null {
  try {
    const decoded = jwt.decode(token) as TokenPayload | null
    return decoded
  } catch {
    return null
  }
}

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
    id: user.id as UUID,
    isFullAccount,
    hasAdminAccess,
    requiresUpgradeForAdmin: user.authType === 'GUEST',
  }
}

export async function getHandoffExchangeUser(userId: string): Promise<HandoffExchangeUser | null> {
  const user = await prisma.user.findUnique({
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

  if (!user) {
    return null
  }

  return {
    ...user,
    id: user.id as UUID,
  }
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
