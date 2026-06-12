import { beforeEach, describe, expect, it, vi } from 'vitest'

const loggerDebug = vi.fn()
const loggerError = vi.fn()

vi.mock('../../src/utils/logger', () => ({
  logger: {
    debug: loggerDebug,
    error: loggerError,
  },
}))

function createStorageMock() {
  const values = new Map<string, string>()

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    clear: vi.fn(() => {
      values.clear()
    }),
  }
}

describe('fetch debug toggles', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    loggerDebug.mockReset()
    loggerError.mockReset()

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost:5173/'),
    })

    delete window.__VTT_DEBUG_HTTP__
  })

  it('enables logging from runtime flag', async () => {
    window.__VTT_DEBUG_HTTP__ = true
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const module = await import('../../src/utils/fetchDebug')
    module.installFetchDebugLogging()
    await window.fetch('http://localhost:3000/api/health')

    expect(loggerDebug).toHaveBeenCalledWith('http.client', 'Fetch debug logging enabled', {
      enabled: true,
    })
    expect(loggerDebug).toHaveBeenCalledWith(
      'http.client',
      'Request start',
      expect.objectContaining({ method: 'GET' })
    )
    expect(loggerDebug).toHaveBeenCalledWith(
      'http.client',
      'Response received',
      expect.objectContaining({ status: 200, ok: true })
    )
  })

  it('accepts query param toggles and persists them', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost:5173/?debugHttp=1'),
    })
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')

    const module = await import('../../src/utils/fetchDebug')

    expect(module.initHttpClientDebugFlag()).toBe(true)
    expect(window.__VTT_DEBUG_HTTP__).toBe(true)
    expect(window.localStorage.setItem).toHaveBeenCalledWith('vtt-debug-http', '1')
    expect(replaceStateSpy).toHaveBeenCalled()
  })
})
