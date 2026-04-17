import { Request, Response, NextFunction } from 'express'
import { verifyUserToken, verifyAdminToken, extractTokenFromHeader } from '@/utils'
import { AuthToken, AdminAuthToken, AuthError, AppError } from '@/types'
import { logger } from '@/utils/logger'

// ============================================================================
// Extended Express Types
// ============================================================================

declare global {
  namespace Express {
    interface Request {
      user?: AuthToken
      admin?: AdminAuthToken
    }
  }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization)

    if (!token) {
      throw new AuthError('Missing authorization token')
    }

    const decoded = verifyUserToken(token)
    req.user = decoded

    next()
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code })
    } else {
      res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' })
    }
  }
}

export const optionalAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization)

    if (token) {
      const decoded = verifyUserToken(token)
      req.user = decoded
    }

    next()
  } catch (error) {
    // Silently fail - authentication is optional
    next()
  }
}

export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization)

    if (!token) {
      throw new AuthError('Missing authorization token')
    }

    const decoded = verifyAdminToken(token)
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

  res.on('finish', () => {
    const duration = Date.now() - startTime
    const method = req.method.padEnd(6)
    const status = `${res.statusCode}`
    const path = req.path

    logger.debug('http', `${method} ${path} [${status}] ${duration}ms`)
  })

  next()
}

// ============================================================================
// CORS Middleware
// ============================================================================

export const corsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const allowedOrigins = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:8443']

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
