import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/types'

const mocks = vi.hoisted(() => ({
  extractTokenFromHeader: vi.fn(),
  verifyToken: vi.fn(),
  validateUserAuthState: vi.fn(),
  verifyAdminToken: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  randomUUID: vi.fn(() => 'req-uuid-1'),
  createRequestMetricsContext: vi.fn(
    (params: { requestId: string; method: string; path: string }) => ({
      requestId: params.requestId,
      method: params.method,
      path: params.path,
      queryCount: 0,
      totalQueryDurationMs: 0,
      slowQueryCount: 0,
    })
  ),
  runWithRequestMetrics: vi.fn((_context: unknown, callback: () => void) => callback()),
}))

vi.mock('@/services/auth.service', () => ({
  extractTokenFromHeader: mocks.extractTokenFromHeader,
  verifyToken: mocks.verifyToken,
}))

vi.mock('@/services/auth/user-context.service', () => ({
  validateUserAuthState: mocks.validateUserAuthState,
}))

vi.mock('@/utils', () => ({
  verifyAdminToken: mocks.verifyAdminToken,
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: mocks.loggerDebug,
  },
}))

vi.mock('@/infra/db/observability', () => ({
  createRequestMetricsContext: mocks.createRequestMetricsContext,
  runWithRequestMetrics: mocks.runWithRequestMetrics,
}))

vi.mock('crypto', () => ({
  randomUUID: mocks.randomUUID,
}))

import {
  adminAuthMiddleware,
  authMiddleware,
  corsMiddleware,
  errorHandler,
  optionalAuthMiddleware,
  requestLoggingMiddleware,
  securityHeadersMiddleware,
  validateJsonBody,
} from '@/infra/http/middleware'

function makeReq(overrides: Record<string, unknown> = {}) {
  const req: any = {
    headers: {},
    method: 'GET',
    path: '/api/test',
    is: vi.fn(() => true),
    ...overrides,
  }
  return req
}

function makeRes() {
  const headerStore = new Map<string, string>()
  const res: any = {
    statusCode: 200,
    body: undefined,
    __finish: undefined,
    status: vi.fn((code: number) => {
      res.statusCode = code
      return res
    }),
    json: vi.fn((payload: unknown) => {
      res.body = payload
      return res
    }),
    header: vi.fn((name: string, value: string) => {
      headerStore.set(name, value)
      return res
    }),
    setHeader: vi.fn((name: string, value: string) => {
      headerStore.set(name, value)
    }),
    sendStatus: vi.fn((code: number) => {
      res.statusCode = code
      return res
    }),
    on: vi.fn((event: string, callback: () => void) => {
      if (event === 'finish') {
        res.__finish = callback
      }
      return res
    }),
  }

  return { res, headerStore }
}

describe('http middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NODE_ENV
    delete process.env.CORS_ALLOWED_ORIGINS
  })

  it('authMiddleware returns 401 when token is missing', async () => {
    mocks.extractTokenFromHeader.mockReturnValue(null)
    const req = makeReq()
    const { res } = makeRes()
    const next = vi.fn()

    await authMiddleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing authorization token',
      code: 'AUTH_ERROR',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('authMiddleware returns 401 when token is invalid', async () => {
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue(null)
    const req = makeReq()
    const { res } = makeRes()

    await authMiddleware(req, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid token',
      code: 'AUTH_ERROR',
    })
  })

  it('authMiddleware returns 401 when auth state is invalidated', async () => {
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: 'u1',
      username: 'andy',
      role: 'DM',
      iat: 1,
      exp: 2,
    })
    mocks.validateUserAuthState.mockResolvedValue({ ok: false, code: 'TOKEN_INVALIDATED' })
    const req = makeReq()
    const { res } = makeRes()

    await authMiddleware(req, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Session is no longer valid',
      code: 'AUTH_ERROR',
    })
  })

  it('authMiddleware attaches normalized user and calls next', async () => {
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: 'u1',
      username: 'andy',
      role: 'DM',
      iat: 123,
      exp: 456,
    })
    mocks.validateUserAuthState.mockResolvedValue({ ok: true })

    const req = makeReq()
    const { res } = makeRes()
    const next = vi.fn()

    await authMiddleware(req, res, next)

    expect(req.user).toEqual({
      userId: 'u1',
      username: 'andy',
      role: 'DM',
      accessMode: 'CAMPAIGN',
      authType: 'FULL',
      sessionId: '',
      iat: 123,
      exp: 456,
    })
    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('authMiddleware falls back to INVALID_TOKEN on unexpected errors', async () => {
    mocks.extractTokenFromHeader.mockImplementation(() => {
      throw new Error('boom')
    })

    const req = makeReq()
    const { res } = makeRes()

    await authMiddleware(req, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid token',
      code: 'INVALID_TOKEN',
    })
  })

  it('optionalAuthMiddleware silently skips when no token', () => {
    mocks.extractTokenFromHeader.mockReturnValue(null)
    const req = makeReq()
    const next = vi.fn()

    optionalAuthMiddleware(req, makeRes().res, next)

    expect(req.user).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('optionalAuthMiddleware attaches user when token decodes', () => {
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyToken.mockReturnValue({
      userId: 'u2',
      username: 'tara',
      role: 'PLAYER',
      accessMode: 'USER',
      authType: 'GUEST',
      sessionId: 's1',
      iat: 5,
      exp: 10,
    })
    const req = makeReq()

    optionalAuthMiddleware(req, makeRes().res, vi.fn())

    expect(req.user).toEqual({
      userId: 'u2',
      username: 'tara',
      role: 'PLAYER',
      accessMode: 'USER',
      authType: 'GUEST',
      sessionId: 's1',
      iat: 5,
      exp: 10,
    })
  })

  it('optionalAuthMiddleware tolerates thrown errors', () => {
    mocks.extractTokenFromHeader.mockImplementation(() => {
      throw new Error('fail')
    })
    const next = vi.fn()

    optionalAuthMiddleware(makeReq(), makeRes().res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('adminAuthMiddleware returns 401 when token missing', async () => {
    mocks.extractTokenFromHeader.mockReturnValue(null)
    const { res } = makeRes()

    await adminAuthMiddleware(makeReq(), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing authorization token',
      code: 'AUTH_ERROR',
    })
  })

  it('adminAuthMiddleware sets req.admin when valid', async () => {
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyAdminToken.mockReturnValue({
      userId: 'admin-1',
      username: 'ops',
      adminRole: 'ADMIN',
    })
    mocks.validateUserAuthState.mockResolvedValue({ ok: true })

    const req = makeReq()
    const next = vi.fn()

    await adminAuthMiddleware(req, makeRes().res, next)

    expect(req.admin).toEqual({ userId: 'admin-1', username: 'ops', adminRole: 'ADMIN' })
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('adminAuthMiddleware returns INVALID_TOKEN for non-auth errors', async () => {
    mocks.extractTokenFromHeader.mockReturnValue('token')
    mocks.verifyAdminToken.mockImplementation(() => {
      throw new Error('invalid')
    })

    const { res } = makeRes()

    await adminAuthMiddleware(makeReq(), res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid admin token', code: 'INVALID_TOKEN' })
  })

  it('errorHandler formats AppError responses', () => {
    const req = makeReq({ path: '/api/foo' })
    const { res } = makeRes()
    const next = vi.fn()

    errorHandler(new AppError(403, 'Forbidden', 'FORBIDDEN'), req, res, next)

    expect(mocks.loggerWarn).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden', code: 'FORBIDDEN' })
  })

  it('errorHandler formats unknown errors as 500', () => {
    const { res } = makeRes()

    errorHandler(new Error('boom'), makeReq(), res, vi.fn())

    expect(mocks.loggerError).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    })
  })

  it('validateJsonBody rejects non-json content types', () => {
    const req = makeReq({ is: vi.fn(() => false) })
    const { res } = makeRes()

    validateJsonBody(req, res, vi.fn())

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Content-Type must be application/json',
      code: 'INVALID_CONTENT_TYPE',
    })
  })

  it('validateJsonBody allows json requests', () => {
    const req = makeReq({ is: vi.fn(() => true) })
    const next = vi.fn()

    validateJsonBody(req, makeRes().res, next)

    expect(next).toHaveBeenCalledTimes(1)
  })

  it('requestLoggingMiddleware uses incoming request id and logs on finish', () => {
    const req = makeReq({ headers: { 'x-request-id': 'incoming-id' }, method: 'POST' })
    const { res, headerStore } = makeRes()
    const next = vi.fn()

    requestLoggingMiddleware(req, res, next)

    expect(req.requestId).toBe('incoming-id')
    expect(headerStore.get('X-Request-Id')).toBe('incoming-id')
    expect(next).toHaveBeenCalledTimes(1)
    expect(mocks.createRequestMetricsContext).toHaveBeenCalledWith({
      requestId: 'incoming-id',
      method: 'POST',
      path: '/api/test',
    })
    expect(mocks.runWithRequestMetrics).toHaveBeenCalledTimes(1)

    res.__finish()
    // Extract the actual log call to check message with lenient timing
    const calls = mocks.loggerDebug.mock.calls
    expect(calls).toHaveLength(1)
    const [category, message, context] = calls[0]
    expect(category).toBe('http')
    expect(message).toMatch(/^POST   \/api\/test \[200\] [0-2]ms$/)
    expect(context).toEqual({
      requestId: 'incoming-id',
      queryCount: 0,
      dbDurationMs: 0,
      slowQueryCount: 0,
    })
  })

  it('requestLoggingMiddleware generates request id when absent', () => {
    const req = makeReq({ headers: {} })
    const { res, headerStore } = makeRes()

    requestLoggingMiddleware(req, res, vi.fn())

    expect(mocks.randomUUID).toHaveBeenCalledTimes(1)
    expect(req.requestId).toBe('req-uuid-1')
    expect(headerStore.get('X-Request-Id')).toBe('req-uuid-1')
  })

  it('securityHeadersMiddleware sets baseline headers in non-production', () => {
    process.env.NODE_ENV = 'development'
    const { res, headerStore } = makeRes()
    const next = vi.fn()

    securityHeadersMiddleware(makeReq(), res, next)

    expect(headerStore.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headerStore.get('X-Frame-Options')).toBe('DENY')
    expect(headerStore.get('Strict-Transport-Security')).toBeUndefined()
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('securityHeadersMiddleware sets production-only headers', () => {
    process.env.NODE_ENV = 'production'
    const { res, headerStore } = makeRes()

    securityHeadersMiddleware(makeReq(), res, vi.fn())

    expect(headerStore.get('Strict-Transport-Security')).toContain('max-age=31536000')
    expect(headerStore.get('Content-Security-Policy')).toContain("default-src 'self'")
  })

  it('corsMiddleware sets CORS headers and calls next for allowed origin', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com,https://localhost:8443'
    const req = makeReq({ headers: { origin: 'https://app.example.com' }, method: 'GET' })
    const { res, headerStore } = makeRes()
    const next = vi.fn()

    corsMiddleware(req, res, next)

    expect(headerStore.get('Access-Control-Allow-Origin')).toBe('https://app.example.com')
    expect(headerStore.get('Access-Control-Allow-Methods')).toContain('GET')
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('corsMiddleware does not set origin header for disallowed origin', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://allowed.example.com'
    const req = makeReq({ headers: { origin: 'https://blocked.example.com' }, method: 'GET' })
    const { res, headerStore } = makeRes()

    corsMiddleware(req, res, vi.fn())

    expect(headerStore.get('Access-Control-Allow-Origin')).toBeUndefined()
  })

  it('corsMiddleware short-circuits OPTIONS preflight', () => {
    const req = makeReq({ method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } })
    const { res } = makeRes()
    const next = vi.fn()

    corsMiddleware(req, res, next)

    expect(res.sendStatus).toHaveBeenCalledWith(200)
    expect(next).not.toHaveBeenCalled()
  })
})
