/** Canonical BullMQ queue names used by both backend (producer) and queues service (consumer). */
export const QUEUE_NAMES = {
  SESSION_LIFECYCLE: 'vttchat:session-lifecycle',
  CLEANUP: 'vttchat:cleanup',
  EMAIL: 'vttchat:email',
  SUMMARY: 'vttchat:summary',
  DLQ: 'vttchat:dlq',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

/** Job type identifiers within each queue. */
export const JOB_TYPES = {
  CLEANUP_OLD_SESSIONS: 'cleanup-old-sessions',
  PROCESS_RECORDING: 'process-recording',
  SEND_EMAIL: 'send-email',
  GENERATE_SUMMARY: 'generate-summary',
  DLQ_ENTRY: 'dlq-entry',
} as const

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES]
