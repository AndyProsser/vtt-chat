import { AsyncLocalStorage } from 'node:async_hooks'
import type { Prisma } from '@prisma/client'
import { logger } from '@/utils/logger'

const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 75
const MAX_QUERY_PREVIEW_LENGTH = 160

type PrismaQueryEvent = Prisma.QueryEvent

export interface PrismaQueryEventEmitter {
  $on(eventType: 'query', callback: (event: PrismaQueryEvent) => void): void
}

export interface RequestMetricsContext {
  requestId: string
  method: string
  path: string
  queryCount: number
  totalQueryDurationMs: number
  slowQueryCount: number
}

const requestMetricsStore = new AsyncLocalStorage<RequestMetricsContext>()

let prismaQueryLoggingInitialized = false

function getSlowQueryThresholdMs(): number {
  const rawValue = Number.parseInt(process.env.PRISMA_SLOW_QUERY_THRESHOLD_MS || '', 10)
  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return DEFAULT_SLOW_QUERY_THRESHOLD_MS
  }

  return rawValue
}

function summarizeQuery(query: string): string {
  const normalized = query.replace(/\s+/g, ' ').trim()
  if (normalized.length <= MAX_QUERY_PREVIEW_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, MAX_QUERY_PREVIEW_LENGTH - 3)}...`
}

export function runWithRequestMetrics<T>(context: RequestMetricsContext, callback: () => T): T {
  return requestMetricsStore.run(context, callback)
}

export function createRequestMetricsContext(params: {
  requestId: string
  method: string
  path: string
}): RequestMetricsContext {
  return {
    requestId: params.requestId,
    method: params.method,
    path: params.path,
    queryCount: 0,
    totalQueryDurationMs: 0,
    slowQueryCount: 0,
  }
}

export function getRequestMetricsContext(): RequestMetricsContext | undefined {
  return requestMetricsStore.getStore()
}

export function attachPrismaQueryLogging(prisma: PrismaQueryEventEmitter): void {
  if (prismaQueryLoggingInitialized) {
    return
  }

  prisma.$on('query', (event: PrismaQueryEvent) => {
    const context = getRequestMetricsContext()
    if (context) {
      context.queryCount += 1
      context.totalQueryDurationMs += event.duration
    }

    if (event.duration < getSlowQueryThresholdMs()) {
      return
    }

    if (context) {
      context.slowQueryCount += 1
    }

    logger.warn('db', 'Slow query detected', {
      requestId: context?.requestId,
      method: context?.method,
      path: context?.path,
      durationMs: event.duration,
      target: event.target,
      query: summarizeQuery(event.query),
    })
  })

  prismaQueryLoggingInitialized = true
}

export function resetPrismaQueryLoggingForTests(): void {
  prismaQueryLoggingInitialized = false
}
