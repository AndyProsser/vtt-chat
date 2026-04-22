import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminApiBase, getJson, requestJson } from '../../utils/api'

describe('admin utils api', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses default admin api base path', () => {
    expect(adminApiBase()).toBe('/admin/api')
  })

  it('adds auth header from session storage and default content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    sessionStorage.setItem('admin-token', 'session-token')
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('/telemetry/status')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    const headers = init.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer session-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('falls back to local storage token when session token is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    })

    localStorage.setItem('admin-token', 'local-token')
    vi.stubGlobal('fetch', fetchMock)

    await requestJson('/telemetry/dashboard')

    const [, init] = fetchMock.mock.calls[0]
    const headers = init.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer local-token')
  })

  it('throws backend-provided error message on failed request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden access' }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(requestJson('/telemetry/logs')).rejects.toThrow('Forbidden access')
  })

  it('calls request using GET via getJson helper', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    })

    vi.stubGlobal('fetch', fetchMock)

    await getJson('/telemetry/status')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('GET')
  })
})
