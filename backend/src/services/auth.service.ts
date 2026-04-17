/**
 * Authentication Service
 * Handles JWT creation, verification, and password hashing.
 * Pure, deterministic logic for token management.
 */

import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import type { UUID } from '@shared'
import { config } from '@/infra/config'

const BCRYPT_ROUNDS = 10
const JWT_ISSUER = 'vtt-chat'

/**
 * JWT token payload shape
 */
export interface TokenPayload {
  userId: UUID
  username: string
  role: 'DM' | 'PLAYER' | 'SPECTATOR'
  sessionId?: UUID
  iat?: number
  exp?: number
}

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
