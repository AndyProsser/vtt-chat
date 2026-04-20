const DEFAULT_BASE = '/admin/api'

export function adminApiBase(): string {
  return import.meta.env.VITE_ADMIN_API_BASE || DEFAULT_BASE
}

function getAdminToken(): string | null {
  return sessionStorage.getItem('admin-token') || localStorage.getItem('admin-token')
}

function buildHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra)
  const token = getAdminToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return headers
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${adminApiBase()}${path}`, {
    ...init,
    headers: buildHeaders(init.headers),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || body.error || `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson<T>(path, { method: 'GET', signal })
}
