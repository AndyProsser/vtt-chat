import type { Request, Response, NextFunction } from 'express'

interface RateLimitOptions {
  windowMs: number
  maxRequests: number
  keyGenerator?: (req: Request) => string
  message?: string
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    return forwardedFor.split(',')[0].trim()
  }
  return req.ip || 'unknown'
}

function cleanupExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key)
    }
  }
}

export function createRateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => getClientIp(req),
    message = 'Too many requests',
  } = options

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    const key = keyGenerator(req)

    cleanupExpiredBuckets(now)

    const bucket = buckets.get(key)

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + windowMs,
      })
      next()
      return
    }

    if (bucket.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader('Retry-After', retryAfterSeconds.toString())
      res.status(429).json({
        code: 'RATE_LIMITED',
        message,
      })
      return
    }

    bucket.count += 1
    next()
  }
}
