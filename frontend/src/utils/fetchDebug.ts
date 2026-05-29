import { logger } from './logger'
import { generateClientId } from './uuid'

const MAX_LOGGED_BODY_LENGTH = 240
const STORAGE_KEY = 'vtt-debug-http'
const QUERY_PARAM = 'debugHttp'

let installed = false

declare global {
  interface Window {
    __VTT_DEBUG_HTTP__?: boolean
  }
}

function parseBooleanFlag(rawValue: string | null): boolean | undefined {
  if (!rawValue) {
    return undefined
  }

  const normalized = rawValue.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true
  }

  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false
  }

  return undefined
}

function readStoredFlag(): boolean | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  try {
    return parseBooleanFlag(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return undefined
  }
}

function persistFlag(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Ignore storage failures in private/incognito contexts.
  }
}

function readQueryFlag(): boolean | 'toggle' | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const params = new URLSearchParams(window.location.search)
  const raw = params.get(QUERY_PARAM)
  if (!raw) {
    return undefined
  }

  const normalized = raw.trim().toLowerCase()
  if (normalized === 'toggle') {
    return 'toggle'
  }

  return parseBooleanFlag(raw)
}

export function isHttpClientDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  if (typeof window.__VTT_DEBUG_HTTP__ === 'boolean') {
    return window.__VTT_DEBUG_HTTP__
  }

  return import.meta.env.VITE_DEBUG_HTTP === '1'
}

export function initHttpClientDebugFlag(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const envEnabled = import.meta.env.VITE_DEBUG_HTTP === '1'
  const runtimeOverride = window.__VTT_DEBUG_HTTP__
  const queryFlag = readQueryFlag()
  const storedFlag = readStoredFlag()

  const defaultValue =
    typeof runtimeOverride === 'boolean'
      ? runtimeOverride
      : typeof storedFlag === 'boolean'
        ? storedFlag
        : envEnabled

  const resolvedEnabled =
    queryFlag === 'toggle'
      ? !defaultValue
      : typeof queryFlag === 'boolean'
        ? queryFlag
        : defaultValue

  window.__VTT_DEBUG_HTTP__ = resolvedEnabled
  persistFlag(resolvedEnabled)

  if (queryFlag !== undefined) {
    const params = new URLSearchParams(window.location.search)
    params.delete(QUERY_PARAM)
    const query = params.toString()
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', nextUrl)
  }

  return resolvedEnabled
}

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

  const debugEnabled = initHttpClientDebugFlag()

  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)

    const method = request.method || init?.method || 'GET'
    const url = request.url
    const requestId = generateClientId('request')
    const startedAt = performance.now()
    const httpClientDebugEnabled = isHttpClientDebugEnabled()

    if (httpClientDebugEnabled) {
      logger.debug('http.client', 'Request start', {
        requestId,
        method,
        url,
        headers: sanitizeHeaders(init?.headers),
        body: summarizeBody(init?.body),
      })
    }

    try {
      const response = await originalFetch(input, init)
      const durationMs = Math.round(performance.now() - startedAt)

      if (httpClientDebugEnabled) {
        logger.debug('http.client', 'Response received', {
          requestId,
          method,
          url,
          status: response.status,
          ok: response.ok,
          durationMs,
          contentType: response.headers.get('content-type') || undefined,
        })
      }

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
  if (debugEnabled) {
    logger.debug('http.client', 'Fetch debug logging enabled', {
      enabled: true,
    })
  }
}
