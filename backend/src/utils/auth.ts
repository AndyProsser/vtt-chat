import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { AuthToken, AdminAuthToken } from '@/types'
import { config } from '@/infra/config'

// ============================================================================
// JWT Token Operations
// ============================================================================

export const createUserToken = (
  userId: string,
  username: string,
  role: string,
  sessionId: string
): string => {
  const payload: Omit<AuthToken, 'iat' | 'exp'> = {
    userId,
    username,
    role: role as AuthToken['role'],
    accessMode: 'CAMPAIGN',
    authType: 'FULL',
    sessionId,
  }

  return jwt.sign(
    payload as any,
    config.jwt.secret as string,
    {
      expiresIn: config.jwt.expiresIn as string,
      issuer: 'vtt-chat',
    } as any
  )
}

export const createAdminToken = (
  userId: string,
  username: string,
  adminRole: AdminAuthToken['adminRole']
): string => {
  const payload: Omit<AdminAuthToken, 'iat' | 'exp'> = {
    userId,
    username,
    adminRole,
  }

  return jwt.sign(
    payload as any,
    config.jwt.adminSecret as string,
    {
      expiresIn: config.jwt.adminExpiresIn as string,
      issuer: 'vtt-chat-admin',
    } as any
  )
}

export const verifyUserToken = (token: string): AuthToken => {
  return jwt.verify(token, config.jwt.secret, {
    issuer: 'vtt-chat',
  }) as AuthToken
}

export const verifyAdminToken = (token: string): AdminAuthToken => {
  return jwt.verify(token, config.jwt.adminSecret, {
    issuer: 'vtt-chat-admin',
  }) as AdminAuthToken
}

export const decodeToken = (token: string): Record<string, any> | null => {
  const decoded = jwt.decode(token)
  return decoded as Record<string, any> | null
}

// ============================================================================
// Password Hashing
// ============================================================================

const SALT_ROUNDS = 12

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash)
}

// ============================================================================
// Token Extraction from Headers
// ============================================================================

export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) {
    return null
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null
  }

  return parts[1]
}

// ============================================================================
// Admin Token Operations
// ============================================================================

export const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = jwt.decode(token) as Record<string, any>
    if (!decoded || !decoded.exp) {
      return true
    }
    return decoded.exp * 1000 < Date.now()
  } catch {
    return true
  }
}
