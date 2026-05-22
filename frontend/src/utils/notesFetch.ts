import type { UUID } from '@shared'
import type { Note } from '@/types/notes'

type ApiNote = {
  id: UUID
  authorId: UUID
  authorUsername: string
  title: string
  content: string
  visibility: Note['visibility']
  tags?: string[]
  allowedUsers?: string[]
  publishedAt?: number | null
  createdAt: number
  updatedAt: number
}

const inFlightSessionNotes = new Map<string, Promise<Note[]>>()
const inFlightCampaignNotes = new Map<string, Promise<Note[]>>()

function toNote(note: ApiNote): Note {
  return {
    id: note.id,
    ownerId: note.authorId,
    ownerUsername: note.authorUsername,
    title: note.title,
    content: note.content,
    visibility: note.visibility,
    tags: note.tags || [],
    allowedUsers: (note.allowedUsers || []).map((userId) => userId as UUID),
    publishedAt: note.publishedAt ?? undefined,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

/**
 * Fetches session notes with in-flight dedupe so concurrent consumers
 * (e.g. Notes workspace + notes rail) do not issue duplicate GET requests.
 */
export function fetchSessionNotesOnce(
  apiUrl: string,
  sessionId: UUID,
  token: string
): Promise<Note[]> {
  const key = `${apiUrl}|${sessionId}|${token}`
  const existing = inFlightSessionNotes.get(key)
  if (existing) {
    return existing
  }

  const request = (async () => {
    const response = await fetch(`${apiUrl}/api/notes/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message ?? `HTTP ${response.status}`)
    }

    const data = await response.json()
    return (data.notes || []).map((note: ApiNote) => toNote(note))
  })()

  inFlightSessionNotes.set(key, request)
  void request
    .finally(() => {
      if (inFlightSessionNotes.get(key) === request) {
        inFlightSessionNotes.delete(key)
      }
    })
    .catch(() => {
      // The caller observes the request failure; this cleanup chain should not rethrow.
    })

  return request
}

/**
 * Fetches campaign-linked notes with in-flight dedupe so multiple notes surfaces
 * do not trigger duplicate campaign note requests.
 */
export function fetchCampaignNotesOnce(
  apiUrl: string,
  campaignId: UUID,
  token: string
): Promise<Note[]> {
  const key = `${apiUrl}|${campaignId}|${token}`
  const existing = inFlightCampaignNotes.get(key)
  if (existing) {
    return existing
  }

  const request = (async () => {
    const response = await fetch(`${apiUrl}/api/notes/campaign/${campaignId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.message ?? `HTTP ${response.status}`)
    }

    const data = await response.json()
    return (data.notes || []).map((note: ApiNote) => toNote(note))
  })()

  inFlightCampaignNotes.set(key, request)
  void request
    .finally(() => {
      if (inFlightCampaignNotes.get(key) === request) {
        inFlightCampaignNotes.delete(key)
      }
    })
    .catch(() => {
      // The caller observes the request failure; this cleanup chain should not rethrow.
    })

  return request
}
