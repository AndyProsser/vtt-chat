import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
}))

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: mocks.loggerWarn,
  },
}))

import {
  attachPrismaQueryLogging,
  createRequestMetricsContext,
  resetPrismaQueryLoggingForTests,
  runWithRequestMetrics,
} from '@/infra/db/observability'

describe('db observability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.PRISMA_SLOW_QUERY_THRESHOLD_MS
    resetPrismaQueryLoggingForTests()
  })

  it('tracks request query counts and logs slow queries', () => {
    const listeners = new Map<string, (event: any) => void>()
    const prisma = {
      $on: vi.fn((event: string, handler: (payload: any) => void) => {
        listeners.set(event, handler)
      }),
    } as any

    attachPrismaQueryLogging(prisma)

    const context = createRequestMetricsContext({
      requestId: 'req-1',
      method: 'GET',
      path: '/api/presence/session-1',
    })

    runWithRequestMetrics(context, () => {
      listeners.get('query')?.({
        query: 'SELECT * FROM "Presence" WHERE "sessionId" = $1',
        duration: 95,
        target: 'quaint::connector::metrics',
      })
    })

    expect(context.queryCount).toBe(1)
    expect(context.totalQueryDurationMs).toBe(95)
    expect(context.slowQueryCount).toBe(1)
    expect(mocks.loggerWarn).toHaveBeenCalledWith('db', 'Slow query detected', {
      requestId: 'req-1',
      method: 'GET',
      path: '/api/presence/session-1',
      durationMs: 95,
      target: 'quaint::connector::metrics',
      query: 'SELECT * FROM "Presence" WHERE "sessionId" = $1',
    })
  })

  it('only initializes the prisma listener once per process', () => {
    const prisma = {
      $on: vi.fn(),
    } as any

    attachPrismaQueryLogging(prisma)
    attachPrismaQueryLogging(prisma)

    expect(prisma.$on).toHaveBeenCalledTimes(1)
  })
})
