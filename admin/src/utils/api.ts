const DEFAULT_BASE = '/admin/api'

export function adminApiBase(): string {
  return import.meta.env.VITE_ADMIN_API_BASE || DEFAULT_BASE
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${adminApiBase()}${path}`, { signal })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.message || body.error || `Request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}
