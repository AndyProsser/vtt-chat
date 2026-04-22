import { Router, type Request, type Response } from 'express'
import { authMiddleware } from '@/infra/http/middleware'
import { persistTelemetryEvents } from '@/infra/telemetry-store'
import { logger } from '@/utils/logger'

const router = Router()

const MAX_BATCH_SIZE = 50
const MAX_EVENT_NAME_LEN = 100

interface ClientTelemetryEvent {
  event: string
  properties?: Record<string, unknown>
  ts?: number
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

export default router
