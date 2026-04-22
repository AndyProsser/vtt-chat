import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../utils/logger'
import { TelemetryClient, sanitizeTelemetryProperties } from '../../utils/telemetry'

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
})
