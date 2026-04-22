import { Router, type Request, type Response } from 'express'
import { authMiddleware } from '@/infra/http/middleware'
import { persistDiagnosticEvents, persistTelemetryEvents } from '@/infra/telemetry-store'
import {
  getExternalSystem,
  isExternalSystemLogIngestionAllowed,
} from '@/services/integrations.service'
import { logger } from '@/utils/logger'

const router = Router()

const MAX_BATCH_SIZE = 50
const MAX_EVENT_NAME_LEN = 100

interface ClientTelemetryEvent {
  event: string
  properties?: Record<string, unknown>
  ts?: number
}

interface ExternalDiagnosticEvent {
  severity?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  source?: string
  message: string
  details?: Record<string, unknown>
  timestamp?: string
}

function sanitizeProperties(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {}

  const sensitive =
    /(message|content|chat|note|body|password|token|email|playername|charactername)/i
  const output: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (sensitive.test(key)) continue

    if (typeof value === 'string') {
      output[key] = value.length > 120 ? `${value.slice(0, 117)}...` : value
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null ||
      value === undefined
    ) {
      output[key] = value
    } else if (Array.isArray(value)) {
      output[key] = value.slice(0, 20)
    } else {
      output[key] = '[object]'
    }
  }

  return output
}

router.post('/client-events', authMiddleware, async (req: Request, res: Response) => {
  const payload = req.body as { events?: ClientTelemetryEvent[] }
  const events = Array.isArray(payload?.events) ? payload.events.slice(0, MAX_BATCH_SIZE) : []

  if (events.length === 0) {
    return res.status(400).json({
      code: 'INVALID_REQUEST',
      message: 'events must be a non-empty array',
    })
  }

  const user = req.user
  const persistedEvents: Array<{
    event: string
    timestampMs: number
    userId?: string
    role?: string
    properties?: Record<string, unknown>
  }> = []

  for (const raw of events) {
    const eventName = String(raw.event || '').slice(0, MAX_EVENT_NAME_LEN)
    if (!eventName) continue

    const ts = typeof raw.ts === 'number' ? raw.ts : Date.now()
    const properties = sanitizeProperties(raw.properties)

    persistedEvents.push({
      event: eventName,
      timestampMs: ts,
      userId: user?.userId,
      role: user?.role,
      properties,
    })

    logger.info('telemetry.client', 'Client telemetry event', {
      event: eventName,
      properties,
      userId: user?.userId,
      role: user?.role,
      ts,
    })
  }

  await persistTelemetryEvents(persistedEvents)

  return res.status(202).json({ ok: true, accepted: events.length })
})

router.post('/external/logs', async (req: Request, res: Response) => {
  const externalSystem = String(req.body?.externalSystem || '')
    .trim()
    .toLowerCase()
  const events = Array.isArray(req.body?.events)
    ? (req.body.events as ExternalDiagnosticEvent[]).slice(0, MAX_BATCH_SIZE)
    : []

  if (!externalSystem) {
    return res.status(400).json({
      code: 'MISSING_EXTERNAL_SYSTEM',
      message: 'externalSystem is required',
    })
  }

  const system = getExternalSystem(externalSystem)
  if (!system || !isExternalSystemLogIngestionAllowed(externalSystem)) {
    return res.status(403).json({
      code: 'INTEGRATION_NOT_AUTHORIZED',
      message: `This platform has not enabled ${system?.displayName || externalSystem} integration.`,
    })
  }

  if (events.length === 0) {
    return res.status(400).json({
      code: 'INVALID_REQUEST',
      message: 'events must be a non-empty array',
    })
  }

  const persisted = await persistDiagnosticEvents(
    events
      .map((event) => ({
        timestamp: event.timestamp || new Date().toISOString(),
        severity: event.severity || 'INFO',
        source: `external:${externalSystem}:${String(event.source || 'extension').slice(0, 50)}`,
        message: String(event.message || '').slice(0, 200),
        details: event.details || {},
      }))
      .filter((event) => Boolean(event.message))
  )

  logger.info('telemetry.external', 'Accepted external diagnostic logs', {
    externalSystem,
    accepted: persisted.length,
  })

  return res.status(202).json({ ok: true, accepted: persisted.length })
})

export default router
