/** Job lifecycle status model — persisted to Postgres by the queues service. */
export enum JobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED_RETRYABLE = 'FAILED_RETRYABLE',
  FAILED_TERMINAL = 'FAILED_TERMINAL',
  CANCELLED = 'CANCELLED',
}

// ---------------------------------------------------------------------------
// Job payload shapes — one per job type.
// Keep payloads narrow: no raw secrets, no whisper content.
// ---------------------------------------------------------------------------

export interface CleanupOldSessionsPayload {
  triggeredBy: 'scheduler' | 'api'
  maxAgeMs?: number
}

export interface ProcessRecordingPayload {
  sessionId: string
  recordingId: string
  storageKey: string
  campaignId?: string
}

export interface SendEmailPayload {
  to: string
  subject: string
  templateId: string
  variables: Record<string, string>
  correlationId?: string
}

export interface GenerateSummaryPayload {
  sessionId: string
  campaignId?: string
  requestedBy: string
  includeTranscript?: boolean
}

/** Written to the DLQ queue after a job exhausts all retries. */
export interface DlqEntryPayload {
  originalQueue: string
  originalJobId: string
  originalJobType: string
  originalPayload: unknown
  failureReason: string
  attemptsMade: number
  failedAt: number
}

/** Union of all concrete job payloads. */
export type AnyJobPayload =
  | CleanupOldSessionsPayload
  | ProcessRecordingPayload
  | SendEmailPayload
  | GenerateSummaryPayload
  | DlqEntryPayload
