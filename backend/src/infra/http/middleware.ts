import { Request, Response, NextFunction } from 'express'
import { verifyAdminToken } from '@/utils'
import { verifyToken, extractTokenFromHeader } from '@/services/auth.service'
import { validateUserAuthState } from '@/services/auth-user-context.service'
import { AuthToken, AdminAuthToken, AuthError, AppError } from '@/types'
import { logger } from '@/utils/logger'
import { randomUUID } from 'crypto'

// ============================================================================
// Extended Express Types
// ============================================================================

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthToken
    admin?: AdminAuthToken
    requestId?: string
  }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization)

    if (!token) {
      throw new AuthError('Missing authorization token')
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      throw new AuthError('Invalid token')
    }

    const state = await validateUserAuthState(decoded.userId, decoded.iat)
    if (!state.ok) {
      throw new AuthError('Session is no longer valid')
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      authType: decoded.authType || 'FULL',
      sessionId: decoded.sessionId || '',
      iat: decoded.iat || 0,
      exp: decoded.exp || 0,
    }

    next()
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code })
    } else {
      res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' })
    }
  }
}

export const optionalAuthMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization)

    if (token) {
      const decoded = verifyToken(token)
      if (decoded) {
        req.user = {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role,
          authType: decoded.authType || 'FULL',
          sessionId: decoded.sessionId || '',
          iat: decoded.iat || 0,
          exp: decoded.exp || 0,
        }
      }
    }

    next()
  } catch {
    // Silently fail - authentication is optional
    next()
  }
}

export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization)

    if (!token) {
      throw new AuthError('Missing authorization token')
    }

    const decoded = verifyAdminToken(token)

    const state = await validateUserAuthState(decoded.userId, decoded.iat)
    if (!state.ok) {
      throw new AuthError('Session is no longer valid')
    }

    req.admin = decoded

    next()
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code })
    } else {
      res.status(401).json({ error: 'Invalid admin token', code: 'INVALID_TOKEN' })
    }
  }
}

// ============================================================================
// Error Handling Middleware
// ============================================================================

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  void next

  if (error instanceof AppError) {
    logger.warn('handlers', 'Application error', {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      path: req.path,
    })

    res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
    })
    return
  }

  logger.error('handlers', 'Unexpected error', error)

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  })
}

// ============================================================================
// Request Validation Middleware
// ============================================================================

export const validateJsonBody = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.is('application/json')) {
    res.status(400).json({
      error: 'Content-Type must be application/json',
      code: 'INVALID_CONTENT_TYPE',
    })
    return
  }
  next()
}

// ============================================================================
// Logging Middleware
// ============================================================================

export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now()
  req.requestId = req.headers['x-request-id']?.toString() || randomUUID()
  res.setHeader('X-Request-Id', req.requestId)

  res.on('finish', () => {
    const duration = Date.now() - startTime
    const method = req.method.padEnd(6)
    const status = `${res.statusCode}`
    const path = req.path

    logger.debug('http', `${method} ${path} [${status}] ${duration}ms`, {
      requestId: req.requestId,
    })
  })

  next()
}

// ============================================================================
// Security Headers Middleware
// ============================================================================

export const securityHeadersMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isProduction = process.env.NODE_ENV === 'production'

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )
  }

  next()
}

// ============================================================================
// CORS Middleware
// ============================================================================

export const corsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const allowedOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ||
    'http://localhost:5173,http://localhost:5174,https://localhost:8443'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const origin = req.headers.origin

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }

  next()
}
