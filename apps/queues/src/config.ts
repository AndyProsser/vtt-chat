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
  /** Bearer token required on admin/enqueue API requests. Empty string = open (dev only). */
  adminSecret: optional('QUEUE_ADMIN_SECRET', ''),
  /** Shared secret for backend ↔ queues internal calls. Must match INTERNAL_JOB_SECRET in the backend. */
  internalJobSecret: optional('INTERNAL_JOB_SECRET', ''),
  /** Base URL of the backend service, e.g. http://backend:3000. Required for lifecycle + cleanup workers. */
  backendInternalUrl: optional('BACKEND_INTERNAL_URL', 'http://backend:3000'),
  nodeEnv: optional('NODE_ENV', 'development'),

  retry: {
    maxAttempts: parseInt(optional('QUEUE_MAX_ATTEMPTS', '5'), 10),
    baseDelayMs: parseInt(optional('QUEUE_BASE_DELAY_MS', '5000'), 10),
  },

  scheduler: {
    cleanupCronExpression: optional('QUEUE_CLEANUP_CRON', '*/5 * * * *'),
  },

  /**
   * Optional downstream service URLs. Workers skip gracefully when unset —
   * enqueue the job freely; it becomes active once the service is deployed.
   */
  integrations: {
    /** LLM summarisation endpoint. When set, the summary worker POSTs session data here. */
    llmSummaryUrl: optional('LLM_SUMMARY_URL', ''),
    /** Recording processor endpoint. When set, the recording worker POSTs recording jobs here. */
    recordingProcessorUrl: optional('RECORDING_PROCESSOR_URL', ''),
  },

  smtp: {
    /**
     * Nodemailer well-known service name, e.g. "Gmail", "Outlook365", "Yahoo".
     * When set, SMTP_HOST / SMTP_PORT / SMTP_SECURE are ignored — nodemailer
     * fills in the correct settings automatically.
     * Full list: https://nodemailer.com/smtp/well-known-services
     */
    service: optional('SMTP_SERVICE', ''),
    host: optional('SMTP_HOST', ''),
    port: parseInt(optional('SMTP_PORT', '587'), 10),
    user: optional('SMTP_USER', ''),
    pass: optional('SMTP_PASS', ''),
    secure: ['1', 'true', 'yes'].includes(optional('SMTP_SECURE', '').toLowerCase()),
    fromEmail: optional('SMTP_FROM_EMAIL', ''),
    fromName: optional('SMTP_FROM_NAME', 'VTT-Chat'),
  },
}
