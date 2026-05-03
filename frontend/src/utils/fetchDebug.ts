import { logger } from './logger'

const MAX_LOGGED_BODY_LENGTH = 240

let installed = false

function summarizeBody(body: BodyInit | null | undefined): string | undefined {
  if (body === null || body === undefined) {
    return undefined
  }

  if (typeof body === 'string') {
    return body.length > MAX_LOGGED_BODY_LENGTH
      ? `${body.slice(0, MAX_LOGGED_BODY_LENGTH)}...`
      : body
  }

  if (body instanceof URLSearchParams) {
    const text = body.toString()
    return text.length > MAX_LOGGED_BODY_LENGTH
      ? `${text.slice(0, MAX_LOGGED_BODY_LENGTH)}...`
      : text
  }

  if (body instanceof FormData) {
    const keys: string[] = []
    for (const [key] of body.entries()) {
      keys.push(key)
    }
    return `FormData(keys=${keys.join(',')})`
  }

  if (body instanceof Blob) {
    return `Blob(size=${body.size}, type=${body.type || 'unknown'})`
  }

  if (body instanceof ArrayBuffer) {
    return `ArrayBuffer(byteLength=${body.byteLength})`
  }

  return Object.prototype.toString.call(body)
}

function sanitizeHeaders(input: HeadersInit | undefined): Record<string, string> | undefined {
  if (!input) return undefined

  const headers = new Headers(input)
  const out: Record<string, string> = {}

  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === 'authorization') {
      out[key] = '[redacted]'
      continue
    }
    out[key] = value
  }

  return out
}

export function installFetchDebugLogging(): void {
  if (typeof window === 'undefined') return
  if (installed) return

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)

    const method = request.method || init?.method || 'GET'
    const url = request.url
    const requestId = crypto.randomUUID()
    const startedAt = performance.now()

    logger.debug('http.client', 'Request start', {
      requestId,
      method,
      url,
      headers: sanitizeHeaders(init?.headers),
      body: summarizeBody(init?.body),
    })

    try {
      const response = await originalFetch(input, init)
      const durationMs = Math.round(performance.now() - startedAt)

      logger.debug('http.client', 'Response received', {
        requestId,
        method,
        url,
        status: response.status,
        ok: response.ok,
        durationMs,
        contentType: response.headers.get('content-type') || undefined,
      })

      return response
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt)

      logger.error('http.client', 'Request failed', {
        requestId,
        method,
        url,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  }

  installed = true
  logger.debug('http.client', 'Fetch debug logging enabled')
}
