/**
 * Frontend telemetry client utility.
 *
 * Goals:
 * - Bounded queue and batch flush controls.
 * - Privacy-safe property sanitization.
 * - Emission pathway independent from console log-level controls.
 */

import { logger } from './logger'

export interface TelemetryEvent {
  event: string
  properties: Record<string, unknown>
  ts: number
}

export interface TelemetryClientOptions {
  flushIntervalMs?: number
  maxBatchSize?: number
  maxQueueSize?: number
  transport?: (events: TelemetryEvent[]) => Promise<void>
}

export interface TelemetryHttpTransportOptions {
  apiUrl: string
  token: string
}

const DEFAULT_FLUSH_INTERVAL_MS = 15_000
const DEFAULT_MAX_BATCH_SIZE = 50
const DEFAULT_MAX_QUEUE_SIZE = 500

const SENSITIVE_KEY_PATTERN =
  /(message|content|chat|note|body|password|token|email|playername|charactername)/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeTelemetryValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeTelemetryValue(entry))
  }

  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) continue
      next[key] = sanitizeTelemetryValue(entry)
    }
    return next
  }

  return String(value)
}

export function sanitizeTelemetryProperties(
  input: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!input) return {}

  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    output[key] = sanitizeTelemetryValue(value)
  }
  return output
}

export class TelemetryClient {
  private queue: TelemetryEvent[] = []
  private flushIntervalId: ReturnType<typeof setInterval> | null = null
  private unloadInstalled = false

  private readonly flushIntervalMs: number
  private readonly maxBatchSize: number
  private readonly maxQueueSize: number
  private transport: (events: TelemetryEvent[]) => Promise<void>

  constructor(options: TelemetryClientOptions = {}) {
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
    this.maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE
    this.transport = options.transport ?? (async () => {})
  }

  setTransport(transport: (events: TelemetryEvent[]) => Promise<void>): void {
    this.transport = transport
  }

  start(): void {
    if (this.flushIntervalId) return

    this.flushIntervalId = setInterval(() => {
      void this.flush()
    }, this.flushIntervalMs)

    this.installUnloadHandler()
  }

  stop(): void {
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId)
      this.flushIntervalId = null
    }
  }

  track(event: string, properties?: Record<string, unknown>): void {
    const entry: TelemetryEvent = {
      event,
      properties: sanitizeTelemetryProperties(properties),
      ts: Date.now(),
    }

    logger.debug('telemetry.client', 'Queued telemetry event', entry)

    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift()
      logger.warn('telemetry.client', 'Telemetry queue at capacity; dropping oldest event')
    }

    this.queue.push(entry)
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return

    const batch = this.queue.splice(0, this.maxBatchSize)
    try {
      await this.transport(batch)
    } catch (error) {
      logger.warn('telemetry.client', 'Telemetry transport failed; restoring batch to queue')
      this.queue.unshift(...batch)
      if (this.queue.length > this.maxQueueSize) {
        this.queue = this.queue.slice(this.queue.length - this.maxQueueSize)
      }

      logger.debug('telemetry.client', 'Telemetry transport error detail', error)
    }
  }

  onSessionEnd(): void {
    void this.flush()
  }

  getQueuedCount(): number {
    return this.queue.length
  }

  private installUnloadHandler(): void {
    if (this.unloadInstalled || typeof window === 'undefined') return

    window.addEventListener('beforeunload', () => {
      void this.flush()
    })

    this.unloadInstalled = true
  }
}

export function createHttpTelemetryTransport(options: TelemetryHttpTransportOptions) {
  const base = options.apiUrl.replace(/\/$/, '')
  const authHeader = `Bearer ${options.token}`

  return async (events: TelemetryEvent[]) => {
    if (events.length === 0) return

    const response = await fetch(`${base}/api/telemetry/client-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ events }),
    })

    if (!response.ok) {
      throw new Error('Telemetry HTTP transport failed')
    }
  }
}

export const telemetryClient = new TelemetryClient()
