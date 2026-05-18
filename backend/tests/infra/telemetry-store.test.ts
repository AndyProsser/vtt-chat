import { beforeEach, describe, expect, it, vi } from 'vitest'

type FileMap = Map<string, string>

const state = vi.hoisted(() => {
  const files: FileMap = new Map()

  return {
    files,
    appendFile: vi.fn(async (filePath: string, content: string) => {
      files.set(filePath, `${files.get(filePath) || ''}${content}`)
    }),
    mkdir: vi.fn(async () => {}),
    readFile: vi.fn(async (filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error('ENOENT')
      }
      return files.get(filePath) as string
    }),
    rename: vi.fn(async (from: string, to: string) => {
      if (!files.has(from)) {
        throw new Error('ENOENT')
      }
      files.set(to, files.get(from) as string)
      files.delete(from)
    }),
    stat: vi.fn(async (filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error('ENOENT')
      }
      return { size: Buffer.byteLength(files.get(filePath) as string) }
    }),
    unlink: vi.fn(async (filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error('ENOENT')
      }
      files.delete(filePath)
    }),
    writeFile: vi.fn(async (filePath: string, content: string) => {
      files.set(filePath, content)
    }),
  }
})

vi.mock('fs/promises', () => ({
  appendFile: state.appendFile,
  mkdir: state.mkdir,
  readFile: state.readFile,
  rename: state.rename,
  stat: state.stat,
  unlink: state.unlink,
  writeFile: state.writeFile,
}))

import {
  findDiagnosticEventById,
  findTelemetryEventById,
  loadDiagnosticEvents,
  loadLogRetentionSettings,
  loadTelemetryEvents,
  persistDiagnosticEvents,
  persistTelemetryEvents,
  updateLogRetentionSettings,
} from '@/infra/telemetry-store'

const LOG_DIR = '/home/andy/Development/vtt-chat/backend/logs'
const RETENTION_FILE = `${LOG_DIR}/log-retention.json`
const TELEMETRY_FILE = `${LOG_DIR}/telemetry-ingest.log`
const DIAGNOSTIC_FILE = `${LOG_DIR}/diagnostic.log`

describe('telemetry-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.files.clear()
  })

  it('loads and persists default retention settings when missing', async () => {
    const settings = await loadLogRetentionSettings()

    expect(settings).toEqual({
      telemetryRetentionDays: 30,
      telemetryMaxFileSizeMb: 10,
      telemetryMaxFiles: 7,
      diagnosticRetentionDays: 14,
      diagnosticMaxFileSizeMb: 10,
      diagnosticMaxFiles: 7,
    })
    expect(state.mkdir).toHaveBeenCalledTimes(1)
    expect(state.writeFile).toHaveBeenCalledWith(
      RETENTION_FILE,
      expect.stringContaining('telemetryRetentionDays'),
      'utf8'
    )
  })

  it('sanitizes retention updates into allowed ranges', async () => {
    state.files.set(RETENTION_FILE, JSON.stringify({ telemetryRetentionDays: 5 }))

    const updated = await updateLogRetentionSettings({
      telemetryRetentionDays: 0,
      telemetryMaxFileSizeMb: 999,
      telemetryMaxFiles: -5,
      diagnosticRetentionDays: 366,
      diagnosticMaxFileSizeMb: 0,
      diagnosticMaxFiles: 50,
    })

    expect(updated).toEqual({
      telemetryRetentionDays: 1,
      telemetryMaxFileSizeMb: 200,
      telemetryMaxFiles: 1,
      diagnosticRetentionDays: 365,
      diagnosticMaxFileSizeMb: 1,
      diagnosticMaxFiles: 30,
    })
  })

  it('persists telemetry events, maps severity, and finds by id', async () => {
    const entries = await persistTelemetryEvents([
      {
        event: 'ROOM_SWITCH',
        timestampMs: Date.parse('2026-05-02T10:00:00.000Z'),
        userId: 'user-1',
        role: 'PLAYER',
        properties: { severity: 'WARN', roomId: 'room-1' },
      },
    ])

    expect(entries).toHaveLength(1)
    expect(entries[0].severity).toBe('WARN')

    const loaded = await loadTelemetryEvents()
    const found = await findTelemetryEventById(entries[0].id)

    expect(loaded).toHaveLength(1)
    expect(found?.message).toBe('ROOM_SWITCH')
    expect(state.appendFile).toHaveBeenCalledWith(
      TELEMETRY_FILE,
      expect.stringContaining('ROOM_SWITCH'),
      'utf8'
    )
  })

  it('prunes telemetry events outside retention window', async () => {
    state.files.set(
      RETENTION_FILE,
      JSON.stringify({
        telemetryRetentionDays: 1,
        telemetryMaxFileSizeMb: 10,
        telemetryMaxFiles: 7,
        diagnosticRetentionDays: 14,
        diagnosticMaxFileSizeMb: 10,
        diagnosticMaxFiles: 7,
      })
    )
    state.files.set(
      TELEMETRY_FILE,
      `${JSON.stringify({
        id: 'old',
        timestamp: '2020-01-01T00:00:00.000Z',
        severity: 'INFO',
        source: 'telemetry',
        message: 'old',
        details: {},
      })}\n${JSON.stringify({
        id: 'new',
        timestamp: new Date().toISOString(),
        severity: 'INFO',
        source: 'telemetry',
        message: 'new',
        details: {},
      })}\n`
    )

    const loaded = await loadTelemetryEvents()

    expect(loaded.map((entry) => entry.id)).toEqual(['new'])
    expect(state.writeFile).toHaveBeenCalledWith(
      TELEMETRY_FILE,
      expect.stringContaining('"new"'),
      'utf8'
    )
  })

  it('deduplicates diagnostic events and finds persisted rows by id', async () => {
    state.files.set(
      RETENTION_FILE,
      JSON.stringify({
        telemetryRetentionDays: 30,
        telemetryMaxFileSizeMb: 10,
        telemetryMaxFiles: 7,
        diagnosticRetentionDays: 30,
        diagnosticMaxFileSizeMb: 10,
        diagnosticMaxFiles: 7,
      })
    )

    const event = {
      timestamp: '2026-05-02T10:00:00.000Z',
      severity: 'INFO' as const,
      source: 'api',
      message: 'Request completed',
      details: { requestId: 'r-1' },
    }

    const first = await persistDiagnosticEvents([event])
    const second = await persistDiagnosticEvents([event])
    const loaded = await loadDiagnosticEvents()
    const found = await findDiagnosticEventById(first[0].id)

    expect(first).toHaveLength(1)
    expect(second).toEqual([])
    expect(loaded).toHaveLength(1)
    expect(found?.source).toBe('api')
  })

  it('rotates files when size exceeds configured maximum', async () => {
    state.files.set(
      RETENTION_FILE,
      JSON.stringify({
        telemetryRetentionDays: 30,
        telemetryMaxFileSizeMb: 1,
        telemetryMaxFiles: 2,
        diagnosticRetentionDays: 14,
        diagnosticMaxFileSizeMb: 10,
        diagnosticMaxFiles: 7,
      })
    )
    state.files.set(TELEMETRY_FILE, 'x'.repeat(1024 * 1024 + 10))
    state.files.set(`${TELEMETRY_FILE}.1`, 'old-rotated')

    await persistTelemetryEvents([
      {
        event: 'CHAT_SENT',
        timestampMs: Date.now(),
      },
    ])

    expect(state.rename).toHaveBeenCalledWith(`${TELEMETRY_FILE}.1`, `${TELEMETRY_FILE}.2`)
    expect(state.rename).toHaveBeenCalledWith(TELEMETRY_FILE, `${TELEMETRY_FILE}.1`)
  })

  it('prunes diagnostics outside retention window', async () => {
    state.files.set(
      RETENTION_FILE,
      JSON.stringify({
        telemetryRetentionDays: 30,
        telemetryMaxFileSizeMb: 10,
        telemetryMaxFiles: 7,
        diagnosticRetentionDays: 1,
        diagnosticMaxFileSizeMb: 10,
        diagnosticMaxFiles: 7,
      })
    )
    state.files.set(
      DIAGNOSTIC_FILE,
      `${JSON.stringify({
        id: 'old-diag',
        timestamp: '2020-01-01T00:00:00.000Z',
        severity: 'INFO',
        source: 'api',
        message: 'old',
        details: {},
      })}\n${JSON.stringify({
        id: 'new-diag',
        timestamp: new Date().toISOString(),
        severity: 'WARN',
        source: 'api',
        message: 'new',
        details: {},
      })}\n`
    )

    const loaded = await loadDiagnosticEvents()

    expect(loaded.map((entry) => entry.id)).toEqual(['new-diag'])
    expect(state.writeFile).toHaveBeenCalledWith(
      DIAGNOSTIC_FILE,
      expect.stringContaining('"new-diag"'),
      'utf8'
    )
  })
})
