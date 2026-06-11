import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, requestJson } from '../../src/utils/api'

// Helper to create a minimal Response-like object
function makeResponse(body: unknown, status: number, contentType = 'application/json'): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(text, {
    status,
    headers: { 'content-type': contentType },
  })
}

describe('ApiError', () => {
  it('is an instance of Error', () => {
    const err = new ApiError('bad', 400)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ApiError')
    expect(err.message).toBe('bad')
    expect(err.status).toBe(400)
  })

  it('stores optional details', () => {
    const details = { field: 'username' }
    const err = new ApiError('invalid', 422, details)
    expect(err.details).toEqual(details)
  })
})

describe('requestJson', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed JSON on success', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ ok: true }, 200))
    const result = await requestJson<{ ok: boolean }>('/api/test')
    expect(result).toEqual({ ok: true })
  })

  it('sends JSON body with content-type header', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ created: true }, 201))
    await requestJson('/api/thing', { method: 'POST', body: { name: 'foo' } })
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect((init as RequestInit).body).toBe('{"name":"foo"}')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
  })

  it('appends query string parameters', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, 200))
    await requestJson('/api/search', { query: { q: 'hello', page: 2, active: true } })
    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toContain('q=hello')
    expect(String(url)).toContain('page=2')
    expect(String(url)).toContain('active=true')
  })

  it('omits null/undefined query params', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, 200))
    await requestJson('/api/search', { query: { q: 'hi', filter: null, sort: undefined } })
    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).not.toContain('filter')
    expect(String(url)).not.toContain('sort')
  })

  it('throws ApiError on non-ok response with JSON message', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ message: 'Not found' }, 404))
    await expect(requestJson('/api/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Not found',
    })
  })

  it('throws ApiError with generic message on non-ok response without message field', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ error: 'boom' }, 500))
    await expect(requestJson('/api/broken')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'Request failed',
    })
  })

  it('parses plain text response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse('pong', 200, 'text/plain'))
    const result = await requestJson<string>('/api/ping')
    expect(result).toBe('pong')
  })

  it('does not send body when body option is undefined', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, 200))
    await requestJson('/api/get')
    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect((init as RequestInit).body).toBeUndefined()
  })
})
