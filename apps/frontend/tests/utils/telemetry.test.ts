import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../src/utils/logger'
import {
  TelemetryClient,
  createHttpTelemetryTransport,
  sanitizeTelemetryProperties,
} from '../../src/utils/telemetry'

describe('sanitizeTelemetryProperties', () => {
  it('removes sensitive keys recursively', () => {
    const sanitized = sanitizeTelemetryProperties({
      event: 'ROOM_SWITCH',
      message: 'secret',
      token: 'abc',
      nested: {
        noteContent: 'top secret',
        safe: 42,
      },
    })

    expect(sanitized.message).toBeUndefined()
    expect(sanitized.token).toBeUndefined()
    expect((sanitized.nested as Record<string, unknown>).noteContent).toBeUndefined()
    expect((sanitized.nested as Record<string, unknown>).safe).toBe(42)
  })

  it('returns an empty object for undefined input', () => {
    expect(sanitizeTelemetryProperties(undefined)).toEqual({})
  })

  it('truncates long strings, limits arrays, and stringifies unknown objects', () => {
    const sanitized = sanitizeTelemetryProperties({
      long: 'x'.repeat(130),
      list: Array.from({ length: 25 }, (_, index) => index),
      custom: new Map([['k', 'v']]),
      ok: true,
    })

    expect((sanitized.long as string).length).toBe(120)
    expect(sanitized.long).toMatch(/\.\.\.$/)
    expect(sanitized.list as unknown[]).toHaveLength(20)
    expect(sanitized.custom).toEqual({})
    expect(sanitized.ok).toBe(true)
  })
})

describe('TelemetryClient', () => {
  beforeEach(() => {
    logger.resetForTests()
    logger.clearPersistedLevel()
    logger.enableConsole(false)
    delete window.__VTT_LOG_LEVEL__
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  it('flushes on interval in bounded batches', async () => {
    const transport = vi.fn().mockResolvedValue(undefined)
    const client = new TelemetryClient({
      flushIntervalMs: 100,
      maxBatchSize: 2,
      transport,
    })

    client.track('A')
    client.track('B')
    client.track('C')
    expect(client.getQueuedCount()).toBe(3)

    client.start()
    await vi.advanceTimersByTimeAsync(100)

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0][0]).toHaveLength(2)
    expect(client.getQueuedCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(100)
    expect(transport).toHaveBeenCalledTimes(2)
    expect(client.getQueuedCount()).toBe(0)

    client.stop()
  })

  it('bounds queue by dropping oldest events at capacity', () => {
    const client = new TelemetryClient({ maxQueueSize: 2 })
    client.track('E1')
    client.track('E2')
    client.track('E3')
    expect(client.getQueuedCount()).toBe(2)
  })

  it('telemetry transport remains active even when console logging is disabled', async () => {
    const transport = vi.fn().mockResolvedValue(undefined)
    const client = new TelemetryClient({ transport })

    logger.enableConsole(false)
    logger.setLevel('ERROR')

    client.track('ROOM_SWITCH', { from: 'main', to: 'group-1' })
    await client.flush()

    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0][0][0].event).toBe('ROOM_SWITCH')
  })

  it('restores failed batches to queue without exceeding max capacity', async () => {
    const transport = vi.fn().mockRejectedValue(new Error('fail'))
    const client = new TelemetryClient({ transport, maxQueueSize: 3 })

    client.track('E1')
    client.track('E2')
    client.track('E3')

    await client.flush()

    expect(client.getQueuedCount()).toBe(3)
  })

  it('start is idempotent and stop is safe when not started', () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener')
    const client = new TelemetryClient({ flushIntervalMs: 100 })

    client.stop()
    client.start()
    client.start()

    expect(addListenerSpy).toHaveBeenCalledTimes(1)
    client.stop()
  })

  it('flush is a no-op when the queue is empty', async () => {
    const transport = vi.fn().mockResolvedValue(undefined)
    const client = new TelemetryClient({ transport })

    await client.flush()

    expect(transport).not.toHaveBeenCalled()
  })

  it('flushes on beforeunload and onSessionEnd', async () => {
    const transport = vi.fn().mockResolvedValue(undefined)
    const client = new TelemetryClient({ transport })

    client.track('A')
    client.start()
    window.dispatchEvent(new Event('beforeunload'))
    await Promise.resolve()

    client.track('B')
    client.onSessionEnd()
    await Promise.resolve()

    expect(transport).toHaveBeenCalledTimes(2)
    client.stop()
  })
})

describe('createHttpTelemetryTransport', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing for an empty event batch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const transport = createHttpTelemetryTransport({
      apiUrl: 'http://api.test/',
      token: 'secret',
    })

    await transport([])

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts telemetry events to the normalized endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
    const transport = createHttpTelemetryTransport({
      apiUrl: 'http://api.test/',
      token: 'secret',
    })

    await transport([{ event: 'E1', properties: {}, ts: 1 }])

    expect(fetchSpy).toHaveBeenCalledWith('http://api.test/api/telemetry/client-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret',
      },
      body: JSON.stringify({ events: [{ event: 'E1', properties: {}, ts: 1 }] }),
    })
  })

  it('throws when the telemetry HTTP transport fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const transport = createHttpTelemetryTransport({
      apiUrl: 'http://api.test',
      token: 'secret',
    })

    await expect(transport([{ event: 'E1', properties: {}, ts: 1 }])).rejects.toThrow(
      'Telemetry HTTP transport failed'
    )
  })
})
