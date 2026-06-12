function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  redisUrl: required('REDIS_URL'),
  port: parseInt(optional('QUEUES_PORT', '3001'), 10),
  /** Bearer token required on admin API requests. Empty string = open (dev only). */
  adminSecret: optional('QUEUE_ADMIN_SECRET', ''),
  nodeEnv: optional('NODE_ENV', 'development'),

  retry: {
    /** Max attempts per job before it moves to the DLQ. */
    maxAttempts: parseInt(optional('QUEUE_MAX_ATTEMPTS', '5'), 10),
    /** Initial backoff delay in ms; doubles each attempt. */
    baseDelayMs: parseInt(optional('QUEUE_BASE_DELAY_MS', '5000'), 10),
  },

  scheduler: {
    /** How often the cleanup scanner runs (repeatable BullMQ job). */
    cleanupCronExpression: optional('QUEUE_CLEANUP_CRON', '*/5 * * * *'),
  },
}
