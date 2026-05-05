import jwt from 'jsonwebtoken'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractTokenFromHeader, isTokenExpired } from '@/utils/auth'

describe('utils/auth', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extractTokenFromHeader handles missing and malformed headers', () => {
    expect(extractTokenFromHeader(undefined)).toBeNull()
    expect(extractTokenFromHeader('Token abc')).toBeNull()
    expect(extractTokenFromHeader('Bearer')).toBeNull()
    expect(extractTokenFromHeader('Bearer token-value')).toBe('token-value')
  })

  it('isTokenExpired returns true for null decode payload', () => {
    vi.spyOn(jwt, 'decode').mockReturnValue(null)
    expect(isTokenExpired('token')).toBe(true)
  })

  it('isTokenExpired returns true when exp is absent', () => {
    vi.spyOn(jwt, 'decode').mockReturnValue({ sub: 'u1' })
    expect(isTokenExpired('token')).toBe(true)
  })

  it('isTokenExpired compares expiration against current time', () => {
    const nowSec = Math.floor(Date.now() / 1000)
    vi.spyOn(jwt, 'decode').mockReturnValue({ exp: nowSec + 60 })
    expect(isTokenExpired('token')).toBe(false)

    vi.spyOn(jwt, 'decode').mockReturnValue({ exp: nowSec - 60 })
    expect(isTokenExpired('token')).toBe(true)
  })

  it('isTokenExpired returns true when decode throws', () => {
    vi.spyOn(jwt, 'decode').mockImplementation(() => {
      throw new Error('bad token')
    })
    expect(isTokenExpired('token')).toBe(true)
  })
})
