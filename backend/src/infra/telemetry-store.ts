import { randomBytes } from 'node:crypto'
import { appendFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface PersistedTelemetryEvent {
  id: string
  timestamp: string
  severity: 'INFO' | 'WARN' | 'ERROR'
  source: string
  message: string
  details: Record<string, unknown>
}

export interface PersistedDiagnosticEvent {
  id: string
  timestamp: string
  severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  source: string
  message: string
  details: Record<string, unknown>
}

export interface LogRetentionSettings {
  telemetryRetentionDays: number
  telemetryMaxFileSizeMb: number
  telemetryMaxFiles: number
  diagnosticRetentionDays: number
  diagnosticMaxFileSizeMb: number
  diagnosticMaxFiles: number
}

const TELEMETRY_DIR = path.resolve(process.cwd(), 'logs')
const TELEMETRY_FILE = path.join(TELEMETRY_DIR, 'telemetry-ingest.log')
const DIAGNOSTIC_FILE = path.join(TELEMETRY_DIR, 'diagnostic.log')
const RETENTION_FILE = path.join(TELEMETRY_DIR, 'log-retention.json')

const DEFAULT_RETENTION_SETTINGS: LogRetentionSettings = {
  telemetryRetentionDays: 30,
  telemetryMaxFileSizeMb: 10,
  telemetryMaxFiles: 7,
  diagnosticRetentionDays: 14,
  diagnosticMaxFileSizeMb: 10,
  diagnosticMaxFiles: 7,
}

function toLine(entry: PersistedTelemetryEvent): string {
  return JSON.stringify(entry)
}

function parseLines(content: string): PersistedTelemetryEvent[] {
  if (!content.trim()) {
    return []
  }

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as PersistedTelemetryEvent
      } catch {
        return null
      }
    })
    .filter((entry): entry is PersistedTelemetryEvent => Boolean(entry))
}

function parseDiagnosticLines(content: string): PersistedDiagnosticEvent[] {
  if (!content.trim()) {
    return []
  }

  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as PersistedDiagnosticEvent
      } catch {
        return null
      }
    })
    .filter((entry): entry is PersistedDiagnosticEvent => Boolean(entry))
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function sanitizeRetentionSettings(input: Partial<LogRetentionSettings>): LogRetentionSettings {
  return {
    telemetryRetentionDays: normalizeNumber(
      input.telemetryRetentionDays,
      DEFAULT_RETENTION_SETTINGS.telemetryRetentionDays,
      1,
      365
    ),
    telemetryMaxFileSizeMb: normalizeNumber(
      input.telemetryMaxFileSizeMb,
      DEFAULT_RETENTION_SETTINGS.telemetryMaxFileSizeMb,
      1,
      200
    ),
    telemetryMaxFiles: normalizeNumber(
      input.telemetryMaxFiles,
      DEFAULT_RETENTION_SETTINGS.telemetryMaxFiles,
      1,
      30
    ),
    diagnosticRetentionDays: normalizeNumber(
      input.diagnosticRetentionDays,
      DEFAULT_RETENTION_SETTINGS.diagnosticRetentionDays,
      1,
      365
    ),
    diagnosticMaxFileSizeMb: normalizeNumber(
      input.diagnosticMaxFileSizeMb,
      DEFAULT_RETENTION_SETTINGS.diagnosticMaxFileSizeMb,
      1,
      200
    ),
    diagnosticMaxFiles: normalizeNumber(
      input.diagnosticMaxFiles,
      DEFAULT_RETENTION_SETTINGS.diagnosticMaxFiles,
      1,
      30
    ),
  }
}

async function ensureTelemetryPath(): Promise<void> {
  await mkdir(TELEMETRY_DIR, { recursive: true })
}

async function rotateFile(filePath: string, maxFiles: number): Promise<void> {
  for (let index = maxFiles - 1; index >= 1; index -= 1) {
    const from = `${filePath}.${index}`
    const to = `${filePath}.${index + 1}`
    try {
      await rename(from, to)
    } catch {
      // ignore missing rotated files
    }
  }

  try {
    await rename(filePath, `${filePath}.1`)
  } catch {
    // nothing to rotate
  }

  try {
    await unlink(`${filePath}.${maxFiles + 1}`)
  } catch {
    // nothing to prune
  }
}

async function rotateIfNeeded(
  filePath: string,
  maxSizeMb: number,
  maxFiles: number
): Promise<void> {
  try {
    const fileStat = await stat(filePath)
    const maxBytes = maxSizeMb * 1024 * 1024
    if (fileStat.size < maxBytes) {
      return
    }
    await rotateFile(filePath, maxFiles)
  } catch {
    // ignore if file is absent
  }
}

async function loadRawRetentionSettings(): Promise<LogRetentionSettings> {
  try {
    const content = await readFile(RETENTION_FILE, 'utf8')
    const parsed = JSON.parse(content) as Partial<LogRetentionSettings>
    return sanitizeRetentionSettings(parsed)
  } catch {
    return DEFAULT_RETENTION_SETTINGS
  }
}

export async function loadLogRetentionSettings(): Promise<LogRetentionSettings> {
  await ensureTelemetryPath()
  const settings = await loadRawRetentionSettings()
  await writeFile(RETENTION_FILE, JSON.stringify(settings, null, 2), 'utf8')
  return settings
}

export async function updateLogRetentionSettings(
  patch: Partial<LogRetentionSettings>
): Promise<LogRetentionSettings> {
  await ensureTelemetryPath()
  const current = await loadRawRetentionSettings()
  const next = sanitizeRetentionSettings({ ...current, ...patch })
  await writeFile(RETENTION_FILE, JSON.stringify(next, null, 2), 'utf8')
  return next
}

async function pruneTelemetryByRetention(
  events: PersistedTelemetryEvent[],
  settings: LogRetentionSettings
): Promise<PersistedTelemetryEvent[]> {
  const cutoff = Date.now() - settings.telemetryRetentionDays * 24 * 60 * 60 * 1000
  const kept = events.filter((entry) => new Date(entry.timestamp).getTime() >= cutoff)

  if (kept.length !== events.length) {
    const content = kept.length ? `${kept.map((entry) => toLine(entry)).join('\n')}\n` : ''
    await writeFile(TELEMETRY_FILE, content, 'utf8')
  }

  return kept
}

async function pruneDiagnosticByRetention(
  events: PersistedDiagnosticEvent[],
  settings: LogRetentionSettings
): Promise<PersistedDiagnosticEvent[]> {
  const cutoff = Date.now() - settings.diagnosticRetentionDays * 24 * 60 * 60 * 1000
  const kept = events.filter((entry) => new Date(entry.timestamp).getTime() >= cutoff)

  if (kept.length !== events.length) {
    const content = kept.length ? `${kept.map((entry) => JSON.stringify(entry)).join('\n')}\n` : ''
    await writeFile(DIAGNOSTIC_FILE, content, 'utf8')
  }

  return kept
}

export async function persistTelemetryEvents(
  events: Array<{
    event: string
    timestampMs: number
    userId?: string
    role?: string
    properties?: Record<string, unknown>
  }>
): Promise<PersistedTelemetryEvent[]> {
  if (events.length === 0) {
    return []
  }

  await ensureTelemetryPath()
  const settings = await loadLogRetentionSettings()

  await rotateIfNeeded(TELEMETRY_FILE, settings.telemetryMaxFileSizeMb, settings.telemetryMaxFiles)

  const entries = events.map((event) => {
    const severity: 'INFO' | 'WARN' | 'ERROR' =
      typeof event.properties?.severity === 'string' &&
      ['WARN', 'ERROR'].includes(event.properties.severity.toUpperCase())
        ? (event.properties.severity.toUpperCase() as 'WARN' | 'ERROR')
        : 'INFO'

    return {
      id: randomBytes(16).toString('hex'),
      timestamp: new Date(event.timestampMs).toISOString(),
      severity,
      source: 'telemetry',
      message: event.event,
      details: {
        userId: event.userId,
        role: event.role,
        properties: event.properties || {},
      },
    } satisfies PersistedTelemetryEvent
  })

  const content = `${entries.map((entry) => toLine(entry)).join('\n')}\n`
  await appendFile(TELEMETRY_FILE, content, 'utf8')

  return entries
}

export async function loadTelemetryEvents(): Promise<PersistedTelemetryEvent[]> {
  const settings = await loadLogRetentionSettings()

  try {
    const content = await readFile(TELEMETRY_FILE, 'utf8')
    const parsed = parseLines(content)
    return pruneTelemetryByRetention(parsed, settings)
  } catch {
    return []
  }
}

export async function findTelemetryEventById(id: string): Promise<PersistedTelemetryEvent | null> {
  const events = await loadTelemetryEvents()
  return events.find((event) => event.id === id) || null
}

export async function persistDiagnosticEvents(
  events: Array<{
    timestamp: string
    severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
    source: string
    message: string
    details?: Record<string, unknown>
  }>
): Promise<PersistedDiagnosticEvent[]> {
  if (events.length === 0) {
    return []
  }

  await ensureTelemetryPath()
  const settings = await loadLogRetentionSettings()

  await rotateIfNeeded(
    DIAGNOSTIC_FILE,
    settings.diagnosticMaxFileSizeMb,
    settings.diagnosticMaxFiles
  )

  const existing = await loadDiagnosticEvents()
  const seen = new Set(existing.map((entry) => entry.id))

  const entries = events
    .map((event) => {
      const signature = `${event.timestamp}|${event.severity}|${event.source}|${event.message}|${JSON.stringify(
        event.details || {}
      )}`
      const id = Buffer.from(signature).toString('base64url').slice(0, 40)

      return {
        id,
        timestamp: event.timestamp,
        severity: event.severity,
        source: event.source,
        message: event.message,
        details: event.details || {},
      } satisfies PersistedDiagnosticEvent
    })
    .filter((entry) => !seen.has(entry.id))

  if (!entries.length) {
    return []
  }

  const content = `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`
  await appendFile(DIAGNOSTIC_FILE, content, 'utf8')

  return entries
}

export async function loadDiagnosticEvents(): Promise<PersistedDiagnosticEvent[]> {
  const settings = await loadLogRetentionSettings()

  try {
    const content = await readFile(DIAGNOSTIC_FILE, 'utf8')
    const parsed = parseDiagnosticLines(content)
    return pruneDiagnosticByRetention(parsed, settings)
  } catch {
    return []
  }
}

export async function findDiagnosticEventById(
  id: string
): Promise<PersistedDiagnosticEvent | null> {
  const events = await loadDiagnosticEvents()
  return events.find((event) => event.id === id) || null
}
