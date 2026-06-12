import type { UUID } from '@shared'
import { logger } from '@/utils/logger'

const pendingProfileRequests: Record<string, Promise<any> | undefined> = {}

export async function fetchSessionUsers(sessionId: UUID): Promise<Array<any>> {
  try {
    const authToken =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
        : null

    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const res = await fetch(`${base}/api/session/${sessionId}/users`, {
      method: 'GET',
      headers: {
        Authorization: authToken ? `Bearer ${authToken}` : '',
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}))
      throw new Error(payload.message || `Failed to fetch session users: ${res.status}`)
    }

    const data = await res.json()
    return data.users || []
  } catch (err) {
    logger.error('session.service', 'Failed to fetch session users', err)
    return []
  }
}

// Fetch a single user's profile. Prefer a lightweight user endpoint when
// available; fall back to the session users list if necessary. Coalesce
// concurrent requests for the same user to avoid duplicate network calls.
export function fetchUserProfile(sessionId: UUID | undefined, userId: UUID): Promise<any> {
  logger.info('session.service', 'fetchUserProfile called', { sessionId, userId })
  const key = `${sessionId || 'global'}:${userId}`
  if (pendingProfileRequests[key]) return pendingProfileRequests[key]

  const p = (async () => {
    try {
      const authToken =
        typeof window !== 'undefined'
          ? sessionStorage.getItem('authToken') || localStorage.getItem('authToken')
          : null
      const base = typeof window !== 'undefined' ? window.location.origin : ''

      // Prefer the single-user endpoint first. If it returns 404 and we
      // have a sessionId, fall back to fetching the session users list and
      // selecting the single user (some deployments don't expose per-user
      // endpoints, but the session list is available).
      // If we have a sessionId, prefer the single-user presence endpoint which
      // contains the enriched presence/profile data we need.
      if (sessionId) {
        try {
          const res = await fetch(`${base}/api/presence/${sessionId}/user/${userId}`, {
            method: 'GET',
            headers: {
              Authorization: authToken ? `Bearer ${authToken}` : '',
              'Content-Type': 'application/json',
            },
          })

          if (res.ok) {
            const payload = await res.json().catch(() => null)
            // endpoint returns { presence: {...}, stats }
            return payload?.presence || payload || null
          }
        } catch (err) {
          logger.warn('session.service', 'presence single-user fetch failed', err)
        }
      }

      // Next, try a dedicated user endpoint
      try {
        const res = await fetch(`${base}/api/users/${userId}`, {
          method: 'GET',
          headers: {
            Authorization: authToken ? `Bearer ${authToken}` : '',
            'Content-Type': 'application/json',
          },
        })

        if (res.ok) {
          const payload = await res.json().catch(() => null)
          return payload || null
        }

        if (res.status === 404 && sessionId) {
          // single-user endpoint not present — try session list
          try {
            const users = await fetchSessionUsers(sessionId)
            return users.find((u: any) => u.id === userId || u.userId === userId) || null
          } catch (err) {
            logger.warn('session.service', 'session users fetch failed after 404', err)
          }
        }
      } catch (err) {
        logger.warn('session.service', 'single user endpoint fetch failed', err)
      }

      return null
    } catch (err) {
      logger.warn('session.service', 'fetchUserProfile failed', err)
      return null
    } finally {
      // clear pending so subsequent calls can try again later
      delete pendingProfileRequests[key]
    }
  })()

  pendingProfileRequests[key] = p
  return p
}
